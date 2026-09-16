import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import CatalogApp from "./CatalogApp";
import "./catalog.css";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("Root element was not found");
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <CatalogApp />
    </BrowserRouter>
  </StrictMode>,
);
