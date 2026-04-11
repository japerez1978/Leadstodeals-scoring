import { routes } from '@vercel/config';

export default {
  framework: 'vite',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  skipDownloads: false,
  rewrites: [
    // Excluir /api, archivos estáticos y capturar SPA
    routes.rewrite('/:path((?!api)(?!.*\\.\\w+$).*)', '/index.html'),
  ],
};
