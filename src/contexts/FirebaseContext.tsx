import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { OperationType, auth, db, googleProvider, handleFirestoreError } from '../firebase.ts';
import type {
  AiPredictionResult,
  AlertEventDoc,
  FavoriteTeamDoc,
  SavedPredictionDoc,
  SportKey,
  TeamBrief,
  UserProfileDoc,
} from '../types/sports.ts';

const DEFAULT_FOLLOWED_LEAGUES = ['esp.1', 'eng.1', 'nba', 'nhl', 'nfl'];
const LOCAL_PREFS_KEY = 'vektorsport_local_state_v1';

interface LocalState {
  followedLeagues: string[];
  notificationsEnabled: boolean;
  oddsFormat: 'decimal' | 'american';
  favoriteTeams: FavoriteTeamDoc[];
  savedPredictions: SavedPredictionDoc[];
  alerts: AlertEventDoc[];
}

function loadLocalState(): LocalState {
  try {
    const raw = localStorage.getItem(LOCAL_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalState>;
      return {
        followedLeagues: Array.isArray(parsed.followedLeagues) && parsed.followedLeagues.length > 0
          ? parsed.followedLeagues.slice(0, 25)
          : DEFAULT_FOLLOWED_LEAGUES,
        notificationsEnabled: Boolean(parsed.notificationsEnabled),
        oddsFormat: parsed.oddsFormat === 'american' ? 'american' : 'decimal',
        favoriteTeams: Array.isArray(parsed.favoriteTeams) ? parsed.favoriteTeams : [],
        savedPredictions: Array.isArray(parsed.savedPredictions) ? parsed.savedPredictions : [],
        alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
      };
    }
  } catch {
    // ignore storage errors
  }
  return {
    followedLeagues: DEFAULT_FOLLOWED_LEAGUES,
    notificationsEnabled: false,
    oddsFormat: 'decimal',
    favoriteTeams: [],
    savedPredictions: [],
    alerts: [],
  };
}

function saveLocalState(state: LocalState): void {
  try {
    localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify(state));
  } catch {
    // ignore storage quota issues
  }
}

export function buildTeamKey(sport: SportKey, league: string, teamId: string): string {
  const clean = `${sport}_${league}_${teamId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  return clean.slice(0, 128);
}

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || 'item';
}

function toEpochMs(raw: unknown): number {
  if (!raw) return 0;
  if (typeof raw === 'string') {
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? 0 : ms;
  }
  if (typeof raw === 'object' && raw !== null) {
    const rec = raw as { toMillis?: () => number; seconds?: number };
    if (typeof rec.toMillis === 'function') return rec.toMillis();
    if (typeof rec.seconds === 'number') return rec.seconds * 1000;
  }
  return 0;
}

interface FirebaseContextValue {
  user: User | null;
  authReady: boolean;
  syncing: boolean;
  authError: string | null;
  clearAuthError: () => void;
  followedLeagues: string[];
  notificationsEnabled: boolean;
  oddsFormat: 'decimal' | 'american';
  favoriteTeams: FavoriteTeamDoc[];
  savedPredictions: SavedPredictionDoc[];
  alerts: AlertEventDoc[];
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  toggleFollowedLeague: (leagueId: string) => Promise<void>;
  toggleFavoriteTeam: (params: {
    team: TeamBrief;
    sport: SportKey;
    league: string;
    leagueName: string;
  }) => Promise<void>;
  isFavoriteTeam: (sport: SportKey, league: string, teamId: string) => boolean;
  savePrediction: (prediction: AiPredictionResult) => Promise<void>;
  addManualBet: (input: {
    sport: SportKey;
    matchTitle: string;
    market: string;
    selection: string;
    confidence: number;
    edgeRating: 'Alto' | 'Moderado' | 'Especulativo';
    initialStatus: 'pending' | 'won' | 'lost' | 'void';
  }) => Promise<void>;
  updatePredictionStatus: (predictionId: string, status: 'won' | 'lost' | 'void') => Promise<void>;
  deleteSavedPrediction: (predictionId: string) => Promise<void>;
  addAlertEvent: (alert: Omit<AlertEventDoc, 'id' | 'userId' | 'createdAt' | 'read'>) => Promise<void>;
  markAlertRead: (alertId: string) => Promise<void>;
  toggleNotifications: () => Promise<void>;
  setOddsFormat: (format: 'decimal' | 'american') => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextValue | null>(null);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [localState, setLocalState] = useState<LocalState>(() => loadLocalState());
  const [cloudProfile, setCloudProfile] = useState<UserProfileDoc | null>(null);
  const [cloudFavorites, setCloudFavorites] = useState<FavoriteTeamDoc[]>([]);
  const [cloudPredictions, setCloudPredictions] = useState<SavedPredictionDoc[]>([]);
  const [cloudAlerts, setCloudAlerts] = useState<AlertEventDoc[]>([]);

  const ensureUserProfile = useCallback(async (currentUser: User, seedState: LocalState): Promise<void> => {
    const profilePath = `users/${currentUser.uid}`;
    const ref = doc(db, 'users', currentUser.uid);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        const displayName = (currentUser.displayName || 'Usuario VektorSport').slice(0, 120);
        const leagues = (seedState.followedLeagues.length > 0
          ? seedState.followedLeagues
          : DEFAULT_FOLLOWED_LEAGUES
        )
          .map((l) => l.slice(0, 32))
          .slice(0, 25);

        await setDoc(ref, {
          uid: currentUser.uid,
          displayName,
          followedLeagues: leagues,
          notificationsEnabled: Boolean(seedState.notificationsEnabled),
          oddsFormat: seedState.oddsFormat === 'american' ? 'american' : 'decimal',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, profilePath);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) {
        setSyncing(true);
        try {
          await ensureUserProfile(nextUser, loadLocalState());
        } catch (err) {
          console.error(err);
        } finally {
          setSyncing(false);
        }
      } else {
        setCloudProfile(null);
        setCloudFavorites([]);
        setCloudPredictions([]);
        setCloudAlerts([]);
      }
    });
    return () => unsub();
  }, [ensureUserProfile]);

  useEffect(() => {
    if (!authReady || !user) return;

    const uid = user.uid;
    const profilePath = `users/${uid}`;
    const favPath = `users/${uid}/favorite_teams`;
    const predPath = `users/${uid}/saved_predictions`;
    const alertPath = `users/${uid}/alert_events`;

    const unsubProfile = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserProfileDoc;
          setCloudProfile(data);
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, profilePath)
    );

    const favQuery = query(
      collection(db, 'users', uid, 'favorite_teams'),
      where('userId', '==', uid)
    );
    const unsubFavs = onSnapshot(
      favQuery,
      (snap) => {
        setCloudFavorites(snap.docs.map((d) => d.data() as FavoriteTeamDoc));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, favPath)
    );

    const predQuery = query(
      collection(db, 'users', uid, 'saved_predictions'),
      where('userId', '==', uid)
    );
    const unsubPreds = onSnapshot(
      predQuery,
      (snap) => {
        const items = snap.docs.map((d) => ({
          ...(d.data() as Omit<SavedPredictionDoc, 'id'>),
          id: d.id,
        }));
        items.sort((a, b) => toEpochMs(b.createdAt) - toEpochMs(a.createdAt));
        setCloudPredictions(items);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, predPath)
    );

    const alertQuery = query(
      collection(db, 'users', uid, 'alert_events'),
      where('userId', '==', uid)
    );
    const unsubAlerts = onSnapshot(
      alertQuery,
      (snap) => {
        const items = snap.docs.map((d) => ({
          ...(d.data() as Omit<AlertEventDoc, 'id'>),
          id: d.id,
        }));
        items.sort((a, b) => toEpochMs(b.createdAt) - toEpochMs(a.createdAt));
        setCloudAlerts(items.slice(0, 40));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, alertPath)
    );

    return () => {
      unsubProfile();
      unsubFavs();
      unsubPreds();
      unsubAlerts();
    };
  }, [authReady, user]);

  const followedLeagues = user && cloudProfile ? cloudProfile.followedLeagues : localState.followedLeagues;
  const notificationsEnabled = user && cloudProfile ? cloudProfile.notificationsEnabled : localState.notificationsEnabled;
  const oddsFormat = user && cloudProfile ? cloudProfile.oddsFormat : localState.oddsFormat;
  const favoriteTeams = user ? cloudFavorites : localState.favoriteTeams;
  const savedPredictions = user ? cloudPredictions : localState.savedPredictions;
  const alerts = user ? cloudAlerts : localState.alerts;

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setAuthError(
          'Ventana de acceso cerrada antes de completar el inicio de sesión. Puedes seguir en modo local o pulsar Sincronizar de nuevo.'
        );
      } else if (code === 'auth/popup-blocked') {
        setAuthError(
          'El navegador bloqueó la ventana emergente de Google. Permite ventanas emergentes para este sitio e inténtalo de nuevo.'
        );
      } else if (code === 'auth/unauthorized-domain') {
        setAuthError(
          'Este dominio aún no está autorizado en Firebase Authentication.'
        );
      } else {
        const msg = error instanceof Error ? error.message : 'No se pudo iniciar sesión con Google.';
        setAuthError(msg);
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    setAuthError(null);
    await firebaseSignOut(auth);
  }, []);

  const toggleFollowedLeague = useCallback(
    async (leagueId: string) => {
      const current = followedLeagues;
      const exists = current.includes(leagueId);
      const next = exists
        ? current.filter((id) => id !== leagueId)
        : [...current, leagueId].slice(0, 25);

      if (next.length === 0) return; // keep at least 1 league active

      if (user) {
        const path = `users/${user.uid}`;
        try {
          await ensureUserProfile(user, localState);
          await updateDoc(doc(db, 'users', user.uid), {
            followedLeagues: next.map((l) => l.slice(0, 32)),
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      } else {
        setLocalState((prev) => {
          const updated = { ...prev, followedLeagues: next };
          saveLocalState(updated);
          return updated;
        });
      }
    },
    [ensureUserProfile, followedLeagues, localState, user]
  );

  const isFavoriteTeam = useCallback(
    (sport: SportKey, league: string, teamId: string) => {
      const key = buildTeamKey(sport, league, teamId);
      return favoriteTeams.some((t) => t.teamKey === key);
    },
    [favoriteTeams]
  );

  const toggleFavoriteTeam = useCallback(
    async ({
      team,
      sport,
      league,
      leagueName,
    }: {
      team: TeamBrief;
      sport: SportKey;
      league: string;
      leagueName: string;
    }) => {
      const teamKey = buildTeamKey(sport, league, team.id);
      const currentlyFav = favoriteTeams.some((t) => t.teamKey === teamKey);

      if (user) {
        const path = `users/${user.uid}/favorite_teams/${teamKey}`;
        try {
          await ensureUserProfile(user, localState);
          const ref = doc(db, 'users', user.uid, 'favorite_teams', teamKey);
          if (currentlyFav) {
            await deleteDoc(ref);
          } else {
            await setDoc(ref, {
              userId: user.uid,
              teamKey,
              teamId: String(team.id).slice(0, 64),
              sport,
              league: league.slice(0, 64),
              leagueName: leagueName.slice(0, 80),
              name: team.name.slice(0, 100),
              shortName: team.shortName.slice(0, 60),
              abbreviation: team.abbreviation.slice(0, 16),
              logo: (team.logo || '').slice(0, 300),
              createdAt: serverTimestamp(),
            });
          }
        } catch (error) {
          handleFirestoreError(error, currentlyFav ? OperationType.DELETE : OperationType.CREATE, path);
        }
      } else {
        setLocalState((prev) => {
          const nextFavs = currentlyFav
            ? prev.favoriteTeams.filter((t) => t.teamKey !== teamKey)
            : [
                {
                  userId: 'local',
                  teamKey,
                  teamId: String(team.id),
                  sport,
                  league,
                  leagueName,
                  name: team.name,
                  shortName: team.shortName,
                  abbreviation: team.abbreviation,
                  logo: team.logo || '',
                },
                ...prev.favoriteTeams,
              ];
          const updated = { ...prev, favoriteTeams: nextFavs };
          saveLocalState(updated);
          return updated;
        });
      }
    },
    [ensureUserProfile, favoriteTeams, localState, user]
  );

  const savePrediction = useCallback(
    async (prediction: AiPredictionResult) => {
      const predKey = sanitizeId(`${prediction.sport}_${prediction.eventId}`);
      if (user) {
        const path = `users/${user.uid}/saved_predictions/${predKey}`;
        try {
          await ensureUserProfile(user, localState);
          await setDoc(doc(db, 'users', user.uid, 'saved_predictions', predKey), {
            userId: user.uid,
            eventId: prediction.eventId.slice(0, 64),
            sport: prediction.sport,
            league: prediction.league.slice(0, 64),
            matchTitle: prediction.matchTitle.slice(0, 160),
            market: prediction.recommendedPick.market.slice(0, 100),
            selection: prediction.recommendedPick.selection.slice(0, 120),
            confidence: Math.min(100, Math.max(0, Number(prediction.recommendedPick.confidence) || 50)),
            edgeRating: prediction.recommendedPick.edgeRating,
            homeWinProb: Math.min(100, Math.max(0, Number(prediction.winProbability.home) || 50)),
            awayWinProb: Math.min(100, Math.max(0, Number(prediction.winProbability.away) || 50)),
            status: 'pending',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, path);
        }
      } else {
        setLocalState((prev) => {
          const nextDoc: SavedPredictionDoc = {
            id: predKey,
            userId: 'local',
            eventId: prediction.eventId,
            sport: prediction.sport,
            league: prediction.league,
            matchTitle: prediction.matchTitle,
            market: prediction.recommendedPick.market,
            selection: prediction.recommendedPick.selection,
            confidence: prediction.recommendedPick.confidence,
            edgeRating: prediction.recommendedPick.edgeRating,
            homeWinProb: prediction.winProbability.home,
            awayWinProb: prediction.winProbability.away,
            status: 'pending',
            createdAt: new Date().toISOString(),
          };
          const filtered = prev.savedPredictions.filter((p) => p.id !== predKey);
          const updated = { ...prev, savedPredictions: [nextDoc, ...filtered] };
          saveLocalState(updated);
          return updated;
        });
      }
    },
    [ensureUserProfile, localState, user]
  );

  const addManualBet = useCallback(
    async (input: {
      sport: SportKey;
      matchTitle: string;
      market: string;
      selection: string;
      confidence: number;
      edgeRating: 'Alto' | 'Moderado' | 'Especulativo';
      initialStatus: 'pending' | 'won' | 'lost' | 'void';
    }) => {
      const cleanMatch = input.matchTitle.trim().slice(0, 160);
      const cleanMarket = (input.market.trim() || 'Moneyline').slice(0, 100);
      const cleanSelection = input.selection.trim().slice(0, 120);
      if (!cleanMatch || !cleanSelection) return;

      const confidence = Math.min(100, Math.max(0, Math.round(Number(input.confidence) || 60)));
      const betId = sanitizeId(`manual_${input.sport}_${Date.now()}`);
      const eventId = `manual_${Date.now()}`.slice(0, 64);

      if (user) {
        const path = `users/${user.uid}/saved_predictions/${betId}`;
        try {
          await ensureUserProfile(user, localState);
          const ref = doc(db, 'users', user.uid, 'saved_predictions', betId);
          await setDoc(ref, {
            userId: user.uid,
            eventId,
            sport: input.sport,
            league: 'manual',
            matchTitle: cleanMatch,
            market: cleanMarket,
            selection: cleanSelection,
            confidence,
            edgeRating: input.edgeRating,
            homeWinProb: 50,
            awayWinProb: 50,
            status: 'pending',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          if (input.initialStatus !== 'pending') {
            await updateDoc(ref, {
              status: input.initialStatus,
              updatedAt: serverTimestamp(),
            });
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, path);
        }
      } else {
        setLocalState((prev) => {
          const nowIso = new Date().toISOString();
          const nextDoc: SavedPredictionDoc = {
            id: betId,
            userId: 'local',
            eventId,
            sport: input.sport,
            league: 'manual',
            matchTitle: cleanMatch,
            market: cleanMarket,
            selection: cleanSelection,
            confidence,
            edgeRating: input.edgeRating,
            homeWinProb: 50,
            awayWinProb: 50,
            status: input.initialStatus,
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          const updated = { ...prev, savedPredictions: [nextDoc, ...prev.savedPredictions] };
          saveLocalState(updated);
          return updated;
        });
      }
    },
    [ensureUserProfile, localState, user]
  );

  const updatePredictionStatus = useCallback(
    async (predictionId: string, status: 'won' | 'lost' | 'void') => {
      if (user) {
        const path = `users/${user.uid}/saved_predictions/${predictionId}`;
        try {
          await updateDoc(doc(db, 'users', user.uid, 'saved_predictions', predictionId), {
            status,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      } else {
        setLocalState((prev) => {
          const updated = {
            ...prev,
            savedPredictions: prev.savedPredictions.map((p) =>
              p.id === predictionId && p.status === 'pending' ? { ...p, status } : p
            ),
          };
          saveLocalState(updated);
          return updated;
        });
      }
    },
    [user]
  );

  const deleteSavedPrediction = useCallback(
    async (predictionId: string) => {
      if (user) {
        const path = `users/${user.uid}/saved_predictions/${predictionId}`;
        try {
          await deleteDoc(doc(db, 'users', user.uid, 'saved_predictions', predictionId));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, path);
        }
      } else {
        setLocalState((prev) => {
          const updated = {
            ...prev,
            savedPredictions: prev.savedPredictions.filter((p) => p.id !== predictionId),
          };
          saveLocalState(updated);
          return updated;
        });
      }
    },
    [user]
  );

  const addAlertEvent = useCallback(
    async (alert: Omit<AlertEventDoc, 'id' | 'userId' | 'createdAt' | 'read'>) => {
      const alertKey = sanitizeId(`${alert.alertType}_${alert.eventId}_${Date.now()}`);
      if (user) {
        const path = `users/${user.uid}/alert_events/${alertKey}`;
        try {
          await ensureUserProfile(user, localState);
          await setDoc(doc(db, 'users', user.uid, 'alert_events', alertKey), {
            userId: user.uid,
            eventId: alert.eventId.slice(0, 64),
            sport: alert.sport,
            title: alert.title.slice(0, 120),
            message: alert.message.slice(0, 280),
            alertType: alert.alertType,
            read: false,
            createdAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, path);
        }
      } else {
        setLocalState((prev) => {
          const nextAlert: AlertEventDoc = {
            id: alertKey,
            userId: 'local',
            eventId: alert.eventId,
            sport: alert.sport,
            title: alert.title,
            message: alert.message,
            alertType: alert.alertType,
            read: false,
            createdAt: new Date().toISOString(),
          };
          const updated = { ...prev, alerts: [nextAlert, ...prev.alerts].slice(0, 30) };
          saveLocalState(updated);
          return updated;
        });
      }
    },
    [ensureUserProfile, localState, user]
  );

  const markAlertRead = useCallback(
    async (alertId: string) => {
      if (user) {
        const path = `users/${user.uid}/alert_events/${alertId}`;
        try {
          await updateDoc(doc(db, 'users', user.uid, 'alert_events', alertId), { read: true });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      } else {
        setLocalState((prev) => {
          const updated = {
            ...prev,
            alerts: prev.alerts.map((a) => (a.id === alertId ? { ...a, read: true } : a)),
          };
          saveLocalState(updated);
          return updated;
        });
      }
    },
    [user]
  );

  const toggleNotifications = useCallback(async () => {
    const next = !notificationsEnabled;
    if (next && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        await Notification.requestPermission().catch(() => undefined);
      }
    }
    if (user) {
      const path = `users/${user.uid}`;
      try {
        await ensureUserProfile(user, localState);
        await updateDoc(doc(db, 'users', user.uid), {
          notificationsEnabled: next,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    } else {
      setLocalState((prev) => {
        const updated = { ...prev, notificationsEnabled: next };
        saveLocalState(updated);
        return updated;
      });
    }
  }, [ensureUserProfile, localState, notificationsEnabled, user]);

  const setOddsFormat = useCallback(
    async (format: 'decimal' | 'american') => {
      if (user) {
        const path = `users/${user.uid}`;
        try {
          await ensureUserProfile(user, localState);
          await updateDoc(doc(db, 'users', user.uid), {
            oddsFormat: format,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      } else {
        setLocalState((prev) => {
          const updated = { ...prev, oddsFormat: format };
          saveLocalState(updated);
          return updated;
        });
      }
    },
    [ensureUserProfile, localState, user]
  );

  return (
    <FirebaseContext.Provider
      value={{
        user,
        authReady,
        syncing,
        authError,
        clearAuthError,
        followedLeagues,
        notificationsEnabled,
        oddsFormat,
        favoriteTeams,
        savedPredictions,
        alerts,
        signInWithGoogle,
        signOut,
        toggleFollowedLeague,
        toggleFavoriteTeam,
        isFavoriteTeam,
        savePrediction,
        addManualBet,
        updatePredictionStatus,
        deleteSavedPrediction,
        addAlertEvent,
        markAlertRead,
        toggleNotifications,
        setOddsFormat,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export function useFirebaseSync(): FirebaseContextValue {
  const ctx = useContext(FirebaseContext);
  if (!ctx) {
    throw new Error('useFirebaseSync debe usarse dentro de FirebaseProvider');
  }
  return ctx;
}
