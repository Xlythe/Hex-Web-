import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { IgUserProfileData, LoggedInUser, Standing } from '../types';

export function PlayerRecords({ user, close, account }: {
  user: LoggedInUser | null; close: () => void; account: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<'standings' | 'achievements'>('standings');
  const [rows, setRows] = useState<Standing[]>();
  const [profile, setProfile] = useState<IgUserProfileData>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    let active = true;
    setError('');
    setRows(undefined);
    setProfile(undefined);
    async function load() {
      if (tab === 'standings') {
        const data = await api.standings();
        if (active) setRows(data);
      } else if (user) {
        const data = await api.getUserProfile({ uid: user.uid, session_id: user.session_id });
        if (data.error) throw new Error(data.message || 'Could not load achievements.');
        if (active) setProfile(data);
      }
    }
    load().catch(e => { if (active) setError(e.message || 'Could not load player records.'); });
    return () => { active = false; };
  }, [tab, user, retry]);

  return <dialog ref={dialog} className="hex-records" aria-labelledby="records-title" onCancel={close}>
    <header><h2 id="records-title">Player records</h2><button onClick={close} aria-label="Close player records">×</button></header>
    <nav aria-label="Player records">
      <button aria-pressed={tab === 'standings'} onClick={() => setTab('standings')}>Standings</button>
      <button aria-pressed={tab === 'achievements'} onClick={() => setTab('achievements')}>Achievements</button>
    </nav>
    {error ? <p role="alert">{error} <button onClick={() => setRetry(retry + 1)}>Retry</button></p> :
      tab === 'standings' ? !rows ? <p role="status">Loading standings…</p> : rows.length === 0 ?
        <p>Standings appear after the first rated game.</p> :
        <table><caption>Top 100 by Xlythe rating</caption><thead><tr><th>Rank</th><th>Player</th><th>Rating</th><th>Wins</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.name}><td>{row.rank}</td><th scope="row">{row.name}</th><td>{row.score}</td><td>{row.wins}</td></tr>)}</tbody></table> :
        !user ? <p>Sign in to see your achievements.</p> : !profile ? <p role="status">Loading achievements…</p> :
        <><p>{profile.playGamesSynced ? 'Google Play Games last synced ' + new Date(profile.playGamesSynced * 1000).toLocaleString()
          : 'Online games count here. To sync Google progress, open Achievements in Hex on Android and choose Sync with Xlythe.'}</p>
          <ul>{profile.achievements?.map(item => <li key={item.name}><span>{item.name}</span>
            <strong>{item.unlocked ? 'Unlocked' : item.incremental ? item.steps + ' steps' : 'Locked'}</strong></li>)}</ul></>}
    <footer><button onClick={account}>{user ? 'View profile' : 'Xlythe sign in'}</button></footer>
  </dialog>;
}
