import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App.tsx'
// Styles are inlined in index.html (not imported here) so vite never enters
// its CSS pipeline for this fixture. vite v8 ships lightningcss as a hard
// dependency and uses it for CSS minify; lightningcss has separate native
// binaries per platform that bun's lockfile only captures for the host the
// install ran on, so a CSS import here breaks Examples smoke on Linux CI
// even though the fixture builds clean on macOS. None of the other demos
// import CSS — keeping this fixture aligned with that pattern.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
