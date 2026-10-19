require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const jarvisTools = {
    functionDeclarations: [
        {
            name: "create_note",
            description: "Crea y guarda una nota o recordatorio en la base de datos personal del usuario.",
            parameters: {
                type: "OBJECT",
                properties: {
                    title: { 
                        type: "STRING", 
                        description: "Un título conciso para la nota (máximo 5 palabras)." 
                    },
                    content: { 
                        type: "STRING", 
                        description: "El contenido completo y detallado de la nota o recordatorio." 
                    },
                    is_reminder: { 
                        type: "BOOLEAN", 
                        description: "Verdadero si el usuario especifica que es un recordatorio o menciona una fecha/hora." 
                    }
                },
                required: ["title", "content"]
            }
        }
    ]
};

app.post('/api/chat', async (req, res) => {
    const { userId, message } = req.body;

    try {
        const { data: history } = await supabase
            .from('messages')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: true })
            .limit(10);

        const chatHistory = (history || []).map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        }));

        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            systemInstruction: "Eres JARVIS. Eres conciso, eficiente y respondes en audio. Usa tus herramientas para guardar notas cuando el usuario te lo pida. Nunca confirmes haber guardado algo a menos que la herramienta haya devuelto un estado exitoso.",
            tools: [jarvisTools]
        });

        const chat = model.startChat({ history: chatHistory });
        let result = await chat.sendMessage(message);

        const functionCalls = result.response.functionCalls();
        
        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
            
            if (call.name === "create_note") {
                const { title, content, is_reminder } = call.args;
                
                const { data, error } = await supabase.from('notes').insert([
                    { 
                        user_id: userId, 
                        title: title, 
                        content: content, 
                        is_reminder: is_reminder || false 
                    }
                ]);

                const functionResponse = {
                    functionResponse: {
                        name: "create_note",
                        response: { 
                            status: error ? "ERROR" : "SUCCESS",
                            details: error ? error.message : "Nota insertada correctamente en la base de datos."
                        }
                    }
                };

                result = await chat.sendMessage([functionResponse]);
            }
        }

        const jarvisResponseText = result.response.text();

        await supabase.from('messages').insert([
            { user_id: userId, role: 'user', content: message },
            { user_id: userId, role: 'assistant', content: jarvisResponseText }
        ]);

        const audioBuffer = await generateElevenLabsAudio(jarvisResponseText);

        res.json({
            text: jarvisResponseText,
            audio: audioBuffer.toString('base64')
        });

    } catch (error) {
        console.error("Fallo en el servidor:", error);
        res.status(500).send("Error interno del servidor de JARVIS.");
    }
});

async function generateElevenLabsAudio(text) {
    const voiceId = process.env.ELEVENLABS_VOICE_ID; 
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    
    const response = await axios.post(url, {
        text: text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.7, similarity_boost: 0.8 }
    }, {
        headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
    });
    
    return Buffer.from(response.data);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`JARVIS activo en el puerto ${PORT}`));
