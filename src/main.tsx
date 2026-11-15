import React from "react";
import ReactDOM from "react-dom/client";
import { FormSyncApp } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <FormSyncApp />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
