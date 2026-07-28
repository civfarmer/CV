/* Offline-first loader map for the embedded portfolio.
   The runtime reads window.__resources: when a CDN URL is mapped it loads that
   src instead, with no SRI. React + ReactDOM point at local files in ../vendor/
   so Vantage & Helm run fully offline from file:// (plain <script> tags are
   CORS-exempt). If a vendor file is missing, the patched loadScript falls back
   to the original CDN URL (no SRI) - so with internet the apps always work,
   and after running Get-Offline-Libs.bat they work with none.
   Babel is mapped to itself: no page uses <x-import>, so it never loads. */
window.__resources = {
  "https://unpkg.com/react@18.3.1/umd/react.production.min.js": "../vendor/react.production.min.js",
  "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js": "../vendor/react-dom.production.min.js",
  "https://unpkg.com/@babel/standalone@7.29.0/babel.min.js": "https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"
};
