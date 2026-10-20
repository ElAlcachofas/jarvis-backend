require('dotenv').config(); 
const express = require('express'); 
const cors = require('cors'); 
const axios = require('axios'); 
const { GoogleGenerativeAI } = require('@google/generative-ai'); 
const { createClient } = require('@supabase/supabase-js'); 

const app = express(); 
const port = process.env.PORT || 3000; 

// Configuración de CORS estricta para tu frontend
app.use(cors({ 
    origin: 'https://elalcachofas.github.io', 
    methods: ['GET', 'POST', 'OPTIONS'], 
    allowedHeaders: ['Content-Type', 'Authorization'] 
})); 

app.use(express.json()); 

// Inicialización de clientes
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY); 
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); 

// Endpoint de diagnóstico
app.get('/', (req, res) => {
    res.send("JARVIS Backend corriendo correctamente 🤖");
});

// Endpoint principal del chat 
app.post('/api/chat', async (req, res) => { 
    try { 
        const { message, userId } = req.body; 
        if (!message) { 
            return res.status(400).json({ error: 'El mensaje es requerido.' }); 
        } 

        // 1. Procesar con Gemini (modelo gemini-3.8-flash)
        const model = genAI.getGenerativeModel({ model: 'gemini-3.8-flash' }); 
        const result = await model.generateContent(message); 
        const textResponse = result.response.text(); 

        if (!textResponse) { 
            throw new Error('Gemini devolvió una respuesta vacía o undefined.'); 
        } 

        // 2. Guardar el historial en Supabase 
        const { error: dbError } = await supabase 
            .from('chat_history') 
            .insert([ 
                { user_id: userId || 'anonymous', user_message: message, bot_response: textResponse } 
            ]); 
            
        if (dbError) { 
            console.error('Error guardando en Supabase:', dbError); 
        } 

        // 3. Generar audio con ElevenLabs 
        let audioDataUrl = "";
        try {
            const voiceId = process.env.ELEVENLABS_VOICE_ID; 
            const elevenLabsResponse = await axios.post( 
                `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, 
                { 
                    text: textResponse, 
                    model_id: 'eleven_multilingual_v2', 
                    voice_settings: { stability: 0.5, similarity_boost: 0.75 } 
                }, 
                { 
                    headers: { 
                        'Accept': 'audio/mpeg', 
                        'xi-api-key': process.env.ELEVENLABS_API_KEY, 
                        'Content-Type': 'application/json' 
                    }, 
                    responseType: 'arraybuffer' 
                } 
            ); 

            const audioBase64 = Buffer.from(elevenLabsResponse.data, 'binary').toString('base64'); 
            audioDataUrl = `data:audio/mpeg;base64,${audioBase64}`;
        } catch (audioErr) {
            console.error('Error en ElevenLabs:', audioErr.message);
        }

        // 4. Enviar respuesta al frontend 
        res.json({ text: textResponse, audio: audioDataUrl }); 

    } catch (error) { 
        console.error('Error en /api/chat:', error.message || error); 
        res.status(500).json({ error: 'Hubo un error procesando la solicitud.', details: error.message }); 
    } 
}); 

app.listen(port, () => { 
    console.log(`JARVIS Backend corriendo en el puerto ${port}`); 
});
