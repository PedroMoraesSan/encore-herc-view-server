{
  "id": "herc-view-server-m8m2",
  "lang": "typescript",
  "global_cors": {
    "allow_origins_without_credentials": [
      "http://localhost:5173",
      "https://*.netlify.app",
      "https://*.herc-seguranca.com"
    ],
    "allow_origins_with_credentials": [
      "http://localhost:5173"
    ],
    "allow_headers": [
      "Content-Type",
      "Authorization",
      "X-Request-ID"
    ],
    "expose_headers": [
      "Content-Length",
      "Content-Type",
      "Content-Disposition"
    ]
  }
}
