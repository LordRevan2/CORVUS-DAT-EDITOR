import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API route for translation
  app.post('/api/translate', async (req, res) => {
    try {
      const { text, targetLanguage } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY no está configurada en el servidor.' });
      }

      if (!text || !targetLanguage) {
        return res.status(400).json({ error: 'Missing text or targetLanguage' });
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: `Traduce el siguiente texto de un videojuego al idioma ${targetLanguage}. 
Debes mantener cualquier variable de formato, etiquetas HTML o símbolos especiales intactos. 
Solo devuelve la traducción cruda y nada más.
Texto original:
${text}`
      });

      res.json({ translation: response.text });
    } catch (error) {
      console.error('Translation error:', error);
      res.status(500).json({ error: 'Failed to translate' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = __dirname;
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
