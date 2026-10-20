const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// Inicialización de Supabase
const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_KEY || '');

// Ruta de diagnóstico
app.get('/', (req, res) => {
    res.send("JARVIS Core Backend Online 🤖");
});

// Endpoint principal de chat
app.post('/api/chat', async (req, res) => {
    const { message } = req.body;

    if (!message) {
        return res.json({ text: "No he recibido ninguna instrucción, Marco.", audio: "" });
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        
        // Petición REST directa al modelo gemini-3.8-flash
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;

        const geminiPayload = {
            contents: [
                {
                    role: "user",
                    parts: [{ text: message }]
                }
            ],
            systemInstruction: {
                parts: [{ text: "Eres JARVIS, un asistente de inteligencia artificial conciso, elegante y servicial. Responde siempre de forma breve y fluida en español." }]
            }
        };

        const geminiRes = await axios.post(geminiUrl, geminiPayload, {
            headers: { 'Content-Type': 'application/json' }
        });

        let jarvisText = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!jarvisText) {
            jarvisText = "Sistemas en línea. ¿Cómo puedo ayudarte, Marco?";
        }

        // Guardar conversación en Supabase
        try {
            await supabase.from('messages').insert([
                { user_id: 'marco-mobile', role: 'user', content: message },
                { user_id: 'marco-mobile', role: 'assistant', content: jarvisText }
            ]);
        } catch (dbErr) {
            console.log("Aviso BD:", dbErr.message);
        }

        // Generar audio con ElevenLabs
        let audioBase64 = "";
        try {
            const voiceId = process.env.ELEVENLABS_VOICE_ID;
            if (voiceId && process.env.ELEVENLABS_API_KEY) {
                const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
                const audioRes = await axios.post(url, {
                    text: jarvisText,
                    model_id: "eleven_multilingual_v2",
                    voice_settings: { stability: 0.75, similarity_boost: 0.85 }
                }, {
                    headers: {
                        'xi-api-key': process.env.ELEVENLABS_API_KEY,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'arraybuffer'
                });

                audioBase64 = Buffer.from(audioRes.data).toString('base64');
            }
        } catch (voiceErr) {
            console.log("Aviso ElevenLabs:", voiceErr.message);
        }

        res.json({
            text: jarvisText,
            audio: audioBase64
        });

    } catch (error) {
        console.error("Error en JARVIS Backend:", error.response?.data || error.message);
        
        const details = error.response?.data?.error?.message || error.message;
        res.status(500).json({ 
            text: `Atención: Error de conexión (${details})`, 
            audio: "" 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`JARVIS activo en puerto ${PORT}`));
