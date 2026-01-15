const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
require("dotenv").config(); 

const app = express();
app.use(bodyParser.json());

// --- VARIABLES DE ENTORNO ---
const TOKEN = process.env.META_TOKEN; 
const PHONE_ID = process.env.META_PHONE_ID; 
const VERIFY_TOKEN = process.env.VERIFY_TOKEN; 
const PORT = process.env.PORT || 3000; 
const DB_FILE = "database.json";

// --- FUNCIONES DE BASE DE DATOS (JSON) ---
function leerDB() {
    try {
        const data = fs.readFileSync(DB_FILE, "utf8");
        return JSON.parse(data);
    } catch (error) {
        return {}; // Si falla o no existe, retorna vacío
    }
}

function guardarDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// 1. Servir la Interfaz Gráfica
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "dashboard.html"));
});

// 2. Endpoint para que el Frontend obtenga el historial real
app.get("/api/historial", (req, res) => {
    const db = leerDB();
    res.json(db);
});

// 3. API para ENVIAR mensajes (MODIFICADA PARA PLANTILLAS DINÁMICAS)
app.post("/api/enviar", async (req, res) => {
    // AHORA RECIBIMOS TAMBIÉN "nombrePlantilla"
    const { telefono, tipo, contenido, nombrePlantilla } = req.body;
    const url = `https://graph.facebook.com/v17.0/${PHONE_ID}/messages`;
    
    let db = leerDB();
    if (!db[telefono]) db[telefono] = []; // Crear chat si no existe

    let dataMeta;

    // Configurar payload para Meta
    if (tipo === "texto") {
        dataMeta = { 
            messaging_product: "whatsapp", 
            to: telefono, 
            type: "text", 
            text: { body: contenido } 
        };
} else if (tipo === "plantilla") {
        const templateName = nombrePlantilla || "hello_world";
        
        // SI ES "hello_world", USAMOS INGLÉS. SI NO, ESPAÑOL.
        const idioma = templateName === "hello_world" ? "en_US" : "es_PE";

        dataMeta = { 
            messaging_product: "whatsapp", 
            to: telefono, 
            type: "template", 
            template: { 
                name: templateName, 
                language: { code: idioma } 
            } 
        };
    }
    try {
        await axios.post(url, dataMeta, {
            headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" }
        });

        // GUARDAR EN BD LOCAL
        // Guardamos el nombre de la plantilla en el historial para que sepas qué enviaste
        const textoGuardado = tipo === "plantilla" ? `🏷️ Plantilla: ${nombrePlantilla}` : contenido;

        db[telefono].push({ 
            tipo: "out", 
            texto: textoGuardado, 
            hora: new Date().toLocaleTimeString() 
        });
        guardarDB(db);

        res.json({ success: true });
        console.log(`📤 Enviado a ${telefono} [${tipo}]`);
    } catch (error) {
        console.error("Error enviando:", error.response ? error.response.data : error.message);
        res.json({ success: false });
    }
});

// 4. Webhook para RECIBIR mensajes
app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === VERIFY_TOKEN) res.send(req.query["hub.challenge"]);
    else res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
    const body = req.body;
    if (body.object) {
        if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
            const mensaje = body.entry[0].changes[0].value.messages[0];
            const de = mensaje.from; // Número del cliente
            const texto = mensaje.text ? mensaje.text.body : "[Archivo Adjunto]";
            
            // GUARDAR EN BD LOCAL
            let db = leerDB();
            if (!db[de]) db[de] = [];
            
            db[de].push({ 
                tipo: "in", 
                texto: texto, 
                hora: new Date().toLocaleTimeString() 
            });
            guardarDB(db);

            console.log(`📩 Mensaje guardado de ${de}: ${texto}`);
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

app.listen(PORT, () => console.log(`🟢 Servidor listo en puerto ${PORT}`));