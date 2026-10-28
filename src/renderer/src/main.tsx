import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

const overlay = window.location.hash === "#overlay";
if (overlay) document.documentElement.classList.add("overlay-mode");
const App = React.lazy(() => (overlay ? import("./Overlay") : import("./App")));
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <React.Suspense
      fallback={<div className="feature-loading">Loading Study Desk…</div>}
    >
      <App />
    </React.Suspense>
  </React.StrictMode>,
);
