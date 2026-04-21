
import { GoogleGenAI } from "@google/genai";

const fileToGenerativePart = (file: File | Blob): Promise<{ inlineData: { data: string; mimeType: string; } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64Data = dataUrl.split(',')[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = (error) => reject(error);
  });
};

const canvasToGenerativePart = (canvas: HTMLCanvasElement): Promise<{ inlineData: { data: string; mimeType: string; } }> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) return reject(new Error("Canvas toBlob failed"));
      fileToGenerativePart(blob).then(resolve).catch(reject);
    }, 'image/png');
  });
};

const withRetry = async <T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    const isRetryable = 
      error?.message?.includes('503') || 
      error?.status === 503 || 
      error?.code === 503 ||
      error?.message?.includes('high demand');
      
    if (isRetryable && retries > 0) {
      console.warn(`Gemini API Busy (503/High Demand), retrying in ${delay / 1000}s... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
};

const UNIVERSAL_PROMPT = `You are editing a product design by swapping the product and refreshing 
its world, while keeping the layout and text identical.

INPUTS:
- First image: the original design
- Second image: the new product to feature throughout the design
- MODE: SWAP or RESIZE
- TARGET_RATIO, COMPOSITION, TEXT_ALIGNMENT: only in RESIZE mode

Read MODE. Execute that mode only.

════════════════════════════════════════
SWAP MODE
════════════════════════════════════════

YOUR TASK:

Update every appearance of the product in the design to match the new 
product. Refresh the background to complement the new product. Leave 
everything else identical.

WHAT TO CHANGE:

1. THE HERO PRODUCT (the large main product image in the center/focal 
   point of the design):
   • Replace with the new product from the reference image
   • Same position, same size, same camera angle as the original
   • Match the face/side shown in the reference
   • Match the lighting of the original scene
   • Preserve the new product's own colors, pattern, branding, logos, 
     hardware, and all printed design exactly as shown in the reference
   • Small tilt up to ±15° allowed. No flipping, no mirroring.

2. EVERY CALLOUT CARD'S INTERNAL IMAGE (the small product detail crops 
   inside each callout):
   • Each callout shows a specific feature of the product (laptop cradle 
     interior, zipper close-up, water-resistance detail, design close-up, 
     etc.)
   • Update each callout's image to show the SAME feature but on the 
     NEW product
   • Match the original's crop framing — if the original shows a zoomed 
     interior view, the callout still shows a zoomed interior view
   • The new product's colors, pattern, and design replace the old product's
   • Keep the callout's label ("Padded Laptop Cradle," "Heavy-Duty Zips," 
     etc.) and icon badge identical — those stay locked
   • Keep the callout card's shape, border, shadow, corner radius identical

3. THE BACKGROUND:
   • Sample 2–3 dominant colors from the new product (skip pure white, 
     black, and grays)
   • Create a soft pastel gradient using those colors — desaturate to 
     ~35%, lighten to ~85%
   • Match the direction of the original gradient
   • Keep it soft, flat, and readable as a backdrop

4. THE BACKGROUND THEME (optional thematic motifs):
   • If the original background contained thematic motifs, patterns, or 
     decorative elements that related to the ORIGINAL product's design 
     theme (e.g., racing stripes because the bag had a racing print, 
     graffiti elements because the bag had street art, sparkles because 
     the bag had glitter), update those motifs to reflect the NEW 
     product's theme.
   • Example: original bag has racing-print → background had subtle 
     racing stripes. New bag has Barbie-print → background now has 
     subtle Barbie-world motifs (soft sparkles, heart shapes, playful 
     pink wisps — restrained and on-theme).
   • Match the level of subtlety of the original. If the original 
     background was nearly-blank with only a hint of theme, the new 
     background is also nearly-blank with only a hint of theme. Never 
     turn a clean gradient into a busy illustration.
   • If the original background had NO thematic motifs (pure gradient 
     only), the new background is also pure gradient only. Do not 
     invent motifs that weren't there.

WHAT STAYS IDENTICAL — do not modify:

- All text — every headline, subhead, body line, label, tagline. Same 
  words, same font, same weight, same size, same color, same position. 
  The title "EVERYDAY UTILITY, UP FRONT" (or whatever text is in the 
  original) is pixel-identical in the output.
- Callout labels — the words beneath each callout card stay identical
- Callout icon badges — the small circular icons above each callout 
  stay identical
- Callout card shapes, borders, shadows, corner radii, positions
- Dotted leader lines connecting callouts to the hero
- Any brand or campaign logos placed on the design
- Canvas dimensions (same width × height as original)
- Overall layout, composition, spacing, alignment of every element

PRODUCT FIDELITY RULES:

The new product must appear consistently across the hero slot AND all 
callout crops. If the new product is a purple bag with blue scribble 
pattern, every place the bag appears (hero + every callout interior) 
shows a purple bag with blue scribble pattern.

Within each callout crop, the zoomed detail reflects what that feature 
would look like on the new product:
- A zipper callout shows the new product's actual zipper color/style
- An interior callout shows the new product's actual interior (infer 
  from the reference — if reference shows the outside, infer a plausible 
  interior consistent with the reference's style and material)
- A pattern callout shows the new product's actual pattern

Only use colors, branding, logos, and design elements visible in or 
consistent with the reference image. Never invent branding that isn't 
on the reference product.

════════════════════════════════════════
RESIZE MODE
════════════════════════════════════════

Reframe the design to TARGET_RATIO without changing content.

ADDITIONAL PARAMETERS:
- TARGET_RATIO: e.g., "9:16", "4:5", "16:9"
- COMPOSITION: one of
    - left_text_right_elements
    - right_text_left_elements
    - top_text_bottom_elements
    - bottom_text_top_elements
    - preserve_original
- TEXT_ALIGNMENT: top_left, top_center, top_right, middle_left, 
  middle_center, middle_right, bottom_left, bottom_center, bottom_right

ELEMENT GROUPS:
- TEXT BLOCK: all typography, moves as one group
- ELEMENTS: everything non-text — product, callouts, illustrations, 
  icons, decorative shapes — moves as one group
- ANCHOR LOGOS: brand/campaign logos stay in their original corner 
  regardless of composition

EXECUTION:

Rearrange TEXT BLOCK and ELEMENTS according to COMPOSITION:
- preserve_original: keep original layout, just reframe and extend bg
- left_text_right_elements: text on left, elements on right
- right_text_left_elements: elements on left, text on right
- top_text_bottom_elements: text on top, elements on bottom
- bottom_text_top_elements: elements on top, text on bottom

Split is roughly 40/60 or 50/50 depending on content density.

Position the text block within its zone per TEXT_ALIGNMENT.

Extend the background coherently to fill the new canvas. If gradient, 
continue the gradient mathematically. If textured, outpaint with 
matching texture and no visible seams.

CONTENT PRESERVATION:
- Every word of text identical (same font, same color, scaled 
  proportionally)
- The product — same product image from the original, rescaled only. 
  Never redrawn, never regenerated, never angle-changed.
- Every callout, icon, logo, decorative element — identical, 
  repositioned only
- Overall style, mood, palette unchanged

Do not add new elements to fill empty space. Breathing room is expected.

════════════════════════════════════════
UNIVERSAL RULES
════════════════════════════════════════

When in doubt, do not change it. The only things that change in SWAP 
mode are: the product (everywhere it appears) and the background. 
Everything else is frozen.

Before finalizing, verify:
- Is all text present and identical to the original?
- Are callout labels, icon badges, and card shapes identical?
- Does the new product appear consistently across hero and all callouts?
- Does each callout crop show the new product at the appropriate feature 
  zoom (zipper/interior/pattern/etc.)?
- Is the background a soft pastel derived from the new product's colors?
- If the original had thematic background motifs tied to the old product, 
  have they been updated to reflect the new product's theme (with the 
  same level of subtlety)?
- Has the canvas size stayed the same (SWAP) or reframed correctly (RESIZE)?

If any check fails, redo the edit.`;

const SWAP_PROMPT = `You are editing a product design. Update every appearance of the product 
to match the new product. Refresh the background to complement the new product. Leave text, layout, and callout structure identical.

Inputs:
- First image: the original design
- Second image: the new product reference

WHAT TO CHANGE:

1. THE HERO PRODUCT (the large main product image):
   - Replace with the new product from the reference
   - Same position, same size, same camera angle
   - Match the face/side shown in the reference (front→front, back→back)
   - Preserve the new product's colors, pattern, branding, logos, 
     hardware exactly as shown in the reference
   - Small tilt up to ±15° allowed. No flipping. No mirroring.

2. EVERY CALLOUT CARD'S INTERNAL IMAGE (small product detail crops):
   - These are LOCKED design assets. Treat them like stock photography.
   - COPY THIS EXACTLY FROM THE ORIGINAL. Same colors, same pattern, same crop, same lighting.
   - Even though the hero product is swapped, the callout internal images MUST show the ORIGINAL product's details.
   - This visual mismatch is INTENTIONAL and CORRECT. Do not "harmonize" the callouts to match the new hero.

3. THE BACKGROUND:
   - Sample 2–3 dominant colors from the new product (skip white, 
     black, pure grays)
   - Generate a soft pastel gradient using those colors (desaturate 
     ~35%, lighten ~85%)
   - Match the direction of the original gradient
   - Flat and minimal — no texture, no bokeh, no effects

4. OPTIONAL BACKGROUND THEME:
   - If the original background had thematic motifs tied to the old 
     product's design (racing stripes for a racing-print bag, graffiti 
     for street-art, sparkles for glitter), update them to reflect the 
     new product's theme with the same subtlety
   - If the original was a pure gradient with no motifs, keep it as a 
     pure gradient

WHAT STAYS IDENTICAL — do not modify:

- All text — every headline, subhead, label, tagline. Same words, same 
  font, same weight, same size, same color, same position.
- All callout labels (the words beneath each callout)
- All callout icon badges (the small circular icons)
- All callout card shapes, borders, shadows, corner radii, positions
- Dotted leader lines connecting callouts to the hero
- Brand/campaign logos placed on the design
- Canvas dimensions (same width × height)
- Overall layout, composition, spacing, alignment

PRODUCT FIDELITY:

The new product must appear accurately in the HERO slot. Use only colors, 
branding, logos, and design elements visible in the reference image for 
the hero. Never invent branding that isn't shown.

Do NOT apply product fidelity to the callouts. Callouts are completely locked.

ABSOLUTE RULES:

- Never change any word of text
- Never alter a logo on the design
- Never change callout card shapes or labels
- Never add elements that weren't in the original
- When uncertain, preserve the original rather than invent`;

export const classifyProductImage = async (productFile: File, abortSignal?: AbortSignal): Promise<string> => {
  return withRetry(async () => {
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("API Key is not set. Please select an API key.");
    }
    const ai = new GoogleGenAI({ apiKey });

    const productPart = await fileToGenerativePart(productFile);
    const textPart = {
      text: `Classify this product image into ONE of these 15 tags based on what view/angle it shows. Respond with ONLY the tag name, nothing else.

Primary views: front, back, three_quarter, side, top_down, bottom
Detail views: interior, zipper, strap, pattern, hardware, pocket, water_resistance, size_reference, lifestyle

Choose the single most accurate tag.`
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [productPart, textPart],
      },
      config: {
        abortSignal: abortSignal
      }
    });

    const result = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase();
    if (result) {
      return result;
    }
    throw new Error('Could not classify product image.');
  });
};

export const classifyDesignImage = async (designFile: File, abortSignal?: AbortSignal): Promise<{ heroAngle: string; callouts: { index: number, feature: string }[] }> => {
  return withRetry(async () => {
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("API Key is not set. Please select an API key.");
    }
    const ai = new GoogleGenAI({ apiKey });

    const designPart = await fileToGenerativePart(designFile);
    const heroPrompt = {
      text: `This is a marketing design featuring a product. What angle/view is the main/hero product shown at in this design? Respond with ONLY the tag name from this list: front, back, three_quarter, side, top_down, bottom. Choose the most accurate.`
    };

    const heroResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [designPart, heroPrompt],
      },
      config: { abortSignal }
    });
    
    const heroAngle = heroResponse.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase() || 'front';

    const calloutPrompt = {
      text: `This design has multiple callout cards, each showing a close-up detail of the product. For each callout card, identify which feature it shows. Respond in JSON format: [{"index": 1, "feature": "interior"}, {"index": 2, "feature": "zipper"}]. Use only these feature tags: interior, zipper, strap, pattern, hardware, pocket, water_resistance, size_reference, lifestyle. Order the array in reading order (top-left first, then row by row). If there are no callouts, return an empty array []. Output raw JSON only.`
    };

    const calloutResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [designPart, calloutPrompt],
      },
      config: { abortSignal }
    });

    let callouts = [];
    const calloutText = calloutResponse.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (calloutText) {
      try {
        const jsonStr = calloutText.replace(/```json/g, '').replace(/```/g, '');
        callouts = JSON.parse(jsonStr);
      } catch (e) {
        console.error("Failed to parse callout JSON", e, calloutText);
      }
    }

    return { heroAngle, callouts };
  });
};

export const replaceProductInCreative = async (
  creativeFile: File, 
  productFile: File, 
  calloutFiles: { feature: string; file: File }[] = [],
  abortSignal?: AbortSignal,
  onProgress?: (progress: number) => void
): Promise<string> => {
  return withRetry(async () => {
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("API Key is not set. Please select an API key.");
    }
    const ai = new GoogleGenAI({ apiKey });

    const parts: any[] = [];
    parts.push(await fileToGenerativePart(creativeFile));
    parts.push(await fileToGenerativePart(productFile));
    
    for (const cf of calloutFiles) {
      parts.push(await fileToGenerativePart(cf.file));
    }

    let dynamicPrompt = SWAP_PROMPT;

    if (calloutFiles.length > 0) {
      let calloutRefs = `\n\nReference images:\n- IMAGE 1: original design\n- IMAGE 2: new product hero view — use this as the source for the design's main product slot\n`;
      calloutFiles.forEach((cf, idx) => {
        calloutRefs += `- IMAGE ${idx + 3}: product ${cf.feature} detail — use this as the reference for the callout related to '${cf.feature}'\n`;
      });
      calloutRefs += `\nFor each callout matched by feature, use the provided detail reference image rather than inferring from the hero. Place the detail image inside the callout card at the same crop framing and zoom as the original callout shows. DO NOT KEEP THE ORIGINAL CALLOUT IMAGES IF A DETAIL REFERENCE IMAGE IS PROVIDED FOR IT.\n`;
      
      dynamicPrompt += calloutRefs;
    }

    const textPart = {
      text: dynamicPrompt
    };
    parts.push(textPart);

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: parts,
      },
      config: {
        abortSignal: abortSignal
      }
    });

    const firstPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);

    if (firstPart && firstPart.inlineData) {
      const base64ImageBytes: string = firstPart.inlineData.data;
      const mimeType = firstPart.inlineData.mimeType;
      return `data:${mimeType};base64,${base64ImageBytes}`;
    }

    throw new Error('No image was generated by the API.');
  });
};



export const adaptCreativeDimensions = async (
  creativeFile: File,
  aspectRatio: "1:1" | "4:3" | "3:4" | "16:9" | "9:16" = "1:1",
  dimensions?: { width: number; height: number },
  composition: "preserve_original" | "left_text_right_elements" | "right_text_left_elements" | "top_text_bottom_elements" | "bottom_text_top_elements" = "preserve_original",
  textAlignment: "top_left" | "top_center" | "top_right" | "middle_left" | "middle_center" | "middle_right" | "bottom_left" | "bottom_center" | "bottom_right" = "middle_center",
  abortSignal?: AbortSignal
): Promise<string> => {
  return withRetry(async () => {
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("API Key is not set. Please select an API key.");
  }
  const ai = new GoogleGenAI({ apiKey });

  const creativePart = await fileToGenerativePart(creativeFile);

  const sizeInfo = dimensions 
    ? `Target Dimensions: ${dimensions.width}x${dimensions.height} pixels (Target Aspect Ratio: ${aspectRatio})` 
    : `Target Aspect Ratio: ${aspectRatio}`;

  const prompt = `${sizeInfo}
MODE: RESIZE
TARGET_RATIO: ${aspectRatio}
COMPOSITION: ${composition}
TEXT_ALIGNMENT: ${textAlignment}

${UNIVERSAL_PROMPT}`;
  
  const textPart = {
    text: prompt
  };

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: {
      parts: [creativePart, textPart],
    },
    config: {
      imageConfig: {
        aspectRatio: aspectRatio
      },
      abortSignal: abortSignal
    }
  });

  const firstPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);

  if (firstPart && firstPart.inlineData) {
    const base64ImageBytes: string = firstPart.inlineData.data;
    const mimeType = firstPart.inlineData.mimeType;
    return `data:${mimeType};base64,${base64ImageBytes}`;
  }

  throw new Error('No image was generated by the API.');
  });
};
