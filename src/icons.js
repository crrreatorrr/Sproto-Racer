const shapes={
 flag:'<path d="M4 21V4c5-4 9 4 16 0v10c-7 4-11-4-16 0"/><path d="M8 4v9m4-8v9m4-8v9M4 8c5-4 9 4 16 0"/>',
 clock:'<circle cx="12" cy="14" r="7.5"/><path d="M12 9v5l3 1M9 2h6m-3 0v4m6 1 2-2"/>',
 tool:'<path d="m8 3 3 3-2 3-3 1-3-3a6 6 0 0 0 7 8l6 6a3 3 0 0 0 4-4l-6-6A6 6 0 0 0 8 3Z"/>',
 tune:'<path d="M3 7h5m4 0h9M3 17h11m4 0h3"/><circle cx="10" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
 pad:'<path d="M7 7h10c3 0 5 9 4 11-1 2-3 1-6-2H9c-3 3-5 4-6 2C2 16 4 7 7 7Z"/><path d="M8 9v5m-2.5-2.5h5M15 11h.1m3 2h.1"/>',
 arrow:'<path d="M3 12h17m-7-7 7 7-7 7"/>',chevron:'<path d="m9 5 7 7-7 7"/>',check:'<path d="m4 12 5 5L20 6"/>',
 sound:'<path d="M3 9h4l5-4v14l-5-4H3Zm12 0c2 2 2 4 0 6m3-9c4 3 4 9 0 12"/>',
 mute:'<path d="M3 9h4l5-4v14l-5-4H3Zm13 1 5 5m0-5-5 5"/>',
 map:'<path d="m2 5 7-2 6 3 7-2v15l-7 2-6-3-7 2Zm7-2v15m6-12v15"/>',
 pause:'<path d="M8 4v16M16 4v16"/>',reset:'<path d="M4 6v5h5"/><path d="M4 11a8 8 0 1 1 2 7"/>',
 close:'<path d="m5 5 14 14m0-14L5 19"/>', keyboard:'<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M5 10h2m2 0h2m2 0h2m2 0h2M6 14h2m2 1h6"/>',
};
export const icon=(k)=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(shapes[k]||'')+'</svg>';
