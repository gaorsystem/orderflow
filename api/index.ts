import { app, initializeServer } from '../server.js';

export default async (req: any, res: any) => {
  try {
    await initializeServer();
    return app(req, res);
  } catch (err: any) {
    console.error('Vercel Function Error:', err);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};
