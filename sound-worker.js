'use strict';

/* Синтез фонового звука в фоновом потоке, чтобы страница не замирала на телефоне */
importScripts(`sounds-gen.js${self.location.search}`);

self.onmessage = (ev) => {
  const { kind, sr } = ev.data;
  const channels = self.EchoSoundGen.render(kind, sr);
  self.postMessage({ kind, channels }, channels.map((c) => c.buffer));
};
