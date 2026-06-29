import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { buildExamplePrompt } from '@/lib/example-prompts';

export async function POST(request: NextRequest) {
  try {
    const { featureId, apiKey, seed } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: buildExamplePrompt(featureId, seed),
      config: { temperature: 1.2, maxOutputTokens: 120 },
    });

    // Concatenate any text parts (mirrors the generate route's extraction).
    let text = '';
    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.text) text += part.text;
      }
    }

    // Strip wrapping quotes / a leading "Prompt:" label the model sometimes adds.
    text = text
      .trim()
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^(prompt|example)\s*:\s*/i, '')
      .trim();

    if (!text) {
      return NextResponse.json(
        { error: 'The model returned an empty example. Please try again.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ prompt: text });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to generate example' },
      { status: 500 }
    );
  }
}
