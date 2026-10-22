import { GoogleGenerativeAI, StreamingMode } from "@google/generative-ai";

const MAX_BODY_BYTES = 600_000;
const MAX_MESSAGE_CHARS = 4_000;
const MAX_CODE_CHARS = 100_000;

const text = (body, status) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function POST(req) {
  try {
    if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) {
      return text("Request too large.", 413);
    }

    const { messages, currentEditorCode, language } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return text("Invalid request body: messages[] missing", 400);
    }

    // Last user message is what we respond to
    const latestMessage = messages[messages.length - 1]?.content;
    if (typeof latestMessage !== "string" || !latestMessage.trim()) {
      return text("Message is empty.", 400);
    }
    if (latestMessage.length > MAX_MESSAGE_CHARS) {
      return text(`Message is too long (max ${MAX_MESSAGE_CHARS} characters).`, 413);
    }

    const safeLanguage = typeof language === "string" && /^[a-z+#]{1,20}$/.test(language) ? language : "plaintext";
    const code = typeof currentEditorCode === "string" ? currentEditorCode.slice(0, MAX_CODE_CHARS) : "";

    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not set");
      return text("The AI assistant isn't available right now.", 503);
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash-lite",
      systemInstruction: `
You are an AI coding assistant inside a collaborative code editor.

Rules:
- Give clean, accurate, helpful answers.
- If the user asks to fix code, provide corrected code blocks.
- Use markdown and fenced code blocks.
- Keep answers concise unless explanation is required.
      `,
    });

    // Build combined prompt
    const prompt = `
User message:
${latestMessage}

Language: ${safeLanguage}

Current editor code:
${code || "(empty)"}
    `;

    // Create streaming API call
    const result = await model.generateContentStream(prompt);

    // Create a ReadableStream to send text chunks to the client
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();

            if (text) {
              controller.enqueue(new TextEncoder().encode(text));
            }
          }
        } catch (err) {
          console.error("Stream Error:", err);
          controller.enqueue(
            new TextEncoder().encode("❌ Streaming error occurred.")
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("Chat API Error:", error);
    return text("The AI assistant hit an error. Please try again.", 500);
  }
}
