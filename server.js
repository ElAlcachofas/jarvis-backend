const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// Inicialización de clientes
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Ruta de salud / diagnóstico
app.get('/', (req, res) => {
    res.send("JARVIS Core Backend Online 🤖");
});

// Endpoint principal
app.post('/api/chat', async (req, res) => {
    const { message } = req.body;

    if (!message) {
        return res.json({ text: "No he recibido ninguna instrucción, Marco.", audio: "" });
    }

    try {
        // 1. Consulta a Gemini utilizando el modelo actualizado gemini-2.5-flash
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash",
            systemInstruction: "Eres JARVIS, un asistente de inteligencia artificial conciso, elegante y servicial. Responde siempre de forma breve y fluida en español."
        });

        const result = await model.generateContent(message);
        let jarvisText = result.response ? result.response.text() : "";

        if (!jarvisText) {
            jarvisText = "Sistemas en línea. ¿Cómo puedo ayudarte, Marco?";
        }

        // 2. Guardar en Supabase (Opcional)
        try {
            await supabase.from('messages').insert([
                { user_id: 'marco-mobile', role: 'user', content: message },
                { user_id: 'marco-mobile', role: 'assistant', content: jarvisText }
            ]);
        } catch (dbErr) {
            console.log("Aviso BD:", dbErr.message);
        }

        // 3. Generar voz con ElevenLabs
        let audioBase64 = "";
        try {
            const voiceId = process.env.ELEVENLABS_VOICE_ID;
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
        } catch (voiceErr) {
            console.log("Aviso ElevenLabs:", voiceErr.message);
        }

        // Responder al cliente
        res.json({
            text: jarvisText,
            audio: audioBase64
        });

    } catch (error) {
        console.error("Error en JARVIS Backend:", error);
        res.status(500).json({ 
            text: `Atención: Error al procesar solicitud (${error.message})`, 
            audio: "" 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`JARVIS activo en puerto ${PORT}`));
