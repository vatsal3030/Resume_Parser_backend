import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

export const extractDetailsFromPDF = async (base64Data) => {
  const prompt = `
You are an expert technical recruiter and resume reviewer.
Analyze the provided resume document.
Extract the following details and strictly format your output as a JSON object:
1. "candidateName": Full name of the candidate. (string or null)
2. "email": Email address. (string or null)
3. "phone": Phone number. (string or null)
4. "linkedin": LinkedIn URL. (string or null)
5. "github": GitHub URL. (string or null)
6. "atsScore": A simulated ATS score out of 100 based on standard industry formats, keywords, and layout. (number)
7. "jobFitScore": A general job fit score out of 100 for a general tech role. (number)
8. "summary": A brief, professional summary of the candidate's profile (3-4 sentences). (string)
9. "strengths": An array of key strengths discovered. (Array of strings)
10. "weaknesses": An array of areas of improvement or missing information. (Array of strings)
11. "suggestions": An array of actionable advice to improve the resume. (Array of strings)
12. "recommendedDoc": A comprehensive markdown string representing an improved, reorganized version of their resume based on your suggestions. Make it look professional.

Return ONLY the raw JSON object. Do not wrap in markdown tags like \`\`\`json.
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash", 
    contents: [
      { text: prompt },
      { inlineData: { mimeType: "application/pdf", data: base64Data } }
    ],
    config: {
      responseMimeType: "application/json"
    }
  });

  return JSON.parse(response.text);
};
