import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

// Load environment variables for local dev
dotenv.config();

const app = express();
const PORT = 3000;

// Enable JSON bodies
app.use(express.json({ limit: "50mb" }));

// Initialize Gemini Client Lazy Loader / Helper
let aiClient: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined. Please add it to your Secrets under Settings.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// ---------------- SERVER ENDPOINTS ----------------

// 1. Health check or server details
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "Sofia Research Engine" });
});

// 2. Main Research & Knowledge Synthesis Endpoint
app.post("/api/research", async (req, res) => {
  try {
    const { query, options } = req.body;
    if (!query || typeof query !== "string" || !query.trim()) {
      return res.status(400).json({ error: "Research query is required." });
    }

    const depth = options?.depth || "exhaustive";
    const tone = options?.tone || "academic";
    const customModel = options?.model;

    // Default to gemini-3.5-flash for maximum reliability and speed, but allow custom
    const model = customModel === "gemini-3.1-pro-preview" ? "gemini-3.1-pro-preview" : "gemini-3.5-flash";

    console.log(`[Sofia Research] Starting research for query: "${query}" using model: ${model}, tone: ${tone}, depth: ${depth}`);

    const ai = getAi();

    const systemInstruction = `You are Sofia, an elite clinical, academic, and scientific literature intelligence bot.
Your objective is to produce highly objective, deeply rigorous, and comprehensive analytical knowledge reports.
You ground your research by synthesizing live search findings. 
Be highly professional, completely facts-oriented, and write full markdown sections.
State findings confidently but map active debates accurately.
You must output your findings formatted strictly as a single JSON object matching the requested schema.`;

    const response = await ai.models.generateContent({
      model,
      contents: `Perform an exhaustive, web-grounded research inquiry on the topic or hypothesis: "${query}"

Guidelines for synthesis:
- Depth style: ${depth} (exhaustive should yield a highly structured review, quick should yield focused insights).
- Tone to adopt: ${tone} (academic means formal scientific prose, executive means strategic summaries with impact bullets, educational means highly clear instructional breakdowns).
- Provide a detailed timeline of historic and modern milestone breakthroughs for this topic.
- Provide a rigorous consensus level out of 100 capturing how much the wider scientific/academic community agrees on this.
- Pinpoint active debates or outstanding questions.
- Write a detailed full markdown literature review divided into 4 key sections.
- Formulate the final JSON document strictly according to the schema.`,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { 
              type: Type.STRING, 
              description: "A 2 to 3 sentence high-level executive summary of this topic and its current state." 
            },
            fullSynthesis: { 
              type: Type.STRING, 
              description: "A comprehensive, multi-section literature analysis formatted in beautiful, detailed Markdown. Ensure you use subheadings (e.g. ### Section Name) and bullet lists. It should contain four distinct sections: 1. Core Paradigm & Fundamental Overviews, 2. Modern Breakthroughs & Scientific Progress, 3. Critical Barriers, Logistics & Limitations, 4. Future Roadmap & Practical Applications." 
            },
            keyTakeaways: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Exactly 4 high-impact takeaways, facts, or statistics reflecting core discoveries on this topic."
            },
            consensusScore: { 
              type: Type.INTEGER, 
              description: "Peer consensus percentage (0 to 100). e.g., 95 for climate change consensus, 50 for active theoretical disputes, 15 for fringe claims." 
            },
            consensusDebate: { 
              type: Type.STRING, 
              description: "A detailed 1-2 paragraph description of the consensus consensus. Spell out what the consensus aligns on, what is actively debated by researchers, and any outstanding structural barriers or key questions." 
            },
            timeline: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  year: { type: Type.STRING, description: "Milestone year, time-period (e.g. '1998', 'Late 2024')" },
                  event: { type: Type.STRING, description: "Action or discovery title" },
                  description: { type: Type.STRING, description: "Brief explanation of what took place and why it was a turning point." }
                },
                required: ["year", "event", "description"]
              },
              description: "Exactly 4 to 6 chronological milestones marking the development of the topic from conception to latest advances."
            },
            relatedQuestions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Exactly 3 distinct, highly advanced questions for follow-up studies or deep drill-downs."
            }
          },
          required: ["summary", "fullSynthesis", "keyTakeaways", "consensusScore", "consensusDebate", "timeline", "relatedQuestions"]
        }
      }
    });

    let rawText = response.text || "";
    
    // Clean JSON wrappers if models returned markdowns code fences
    if (rawText.startsWith("```json")) {
      rawText = rawText.substring(7);
    }
    if (rawText.endsWith("```")) {
      rawText = rawText.substring(0, rawText.length - 3);
    }
    rawText = rawText.trim();

    // Parse output JSON
    let parsedResult;
    try {
      parsedResult = JSON.parse(rawText);
    } catch (parseErr) {
      console.error("[Sofia Research] JSON Parse failed for text:", rawText);
      throw new Error("The model did not return a valid structured JSON report. Please retry.");
    }

    // Extract citations from Search Grounding Metadata
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const rawCitations = chunks
      .map((chk: any) => {
        const title = chk?.web?.title || (chk?.web?.uri ? new URL(chk.web.uri).hostname : "Academic Source");
        const url = chk?.web?.uri || "";
        return { title, url };
      })
      .filter((cit: any) => cit.url !== "");

    // Unique URL citations
    const uniqueCitations = Array.from(
      new Map(rawCitations.map((item: any) => [item.url, item])).values()
    );

    // Final consolidated results
    const responsePayload = {
      ...parsedResult,
      citations: uniqueCitations.slice(0, 12) // caps at 12 citations to keep structure tight
    };

    return res.json(responsePayload);

  } catch (err: any) {
    console.error("[Sofia Research] Research compilation failed:", err);
    return res.status(500).json({ error: err.message || "Synthesizer engine failed. Please verify API configuration." });
  }
});

// 3. Narrative Text-to-Speech Generation Endpoint
app.post("/api/tts", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Text compilation is required for speech synthesis." });
    }

    console.log(`[Sofia Research] Generating narrative TTS for text length: ${text.length}`);

    const ai = getAi();
    // Use gemini-3.1-flash-tts-preview as standard key speech model
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: `Say clearly, professionally and naturally: ${text}` }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Zephyr" } // Zephyr provides an informative, crisp academic style
          }
        }
      }
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    let audioBase64 = "";

    for (const part of parts) {
      if (part.inlineData?.data) {
        audioBase64 = part.inlineData.data;
        break;
      }
    }

    if (!audioBase64) {
      return res.status(500).json({ error: "No voice stream payload received in model candidate." });
    }

    return res.json({ audio: audioBase64 });

  } catch (err: any) {
    console.error("[Sofia Research] Narrator synthesis error:", err);
    return res.status(500).json({ error: err.message || "Failed to generate narrative audio. Ensure key permissions are set." });
  }
});

// ---------------- VITE MIDDLEWARE CONFIG ----------------

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("[Sofia Research Server] Dev server mounted with Vite middleware.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("[Sofia Research Server] Production server mounting static files from /dist");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Sofia Research Server] Operating on http://0.0.0.0:${PORT}`);
  });
}

startServer();
