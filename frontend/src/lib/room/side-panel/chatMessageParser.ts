export interface MessagePart {
  text?: string;
  emoji?: string;
  url?: string;
  spoilerContent?: string; // Will hold the content of the spoiler, e.g., "this" for "||this||"
}

// Regex to capture:
// 1. Emojis (e.g., :smile:) - Captured in group 1
// 2. URLs (e.g., http://example.com) - Captured in group 2
// 3. Spoilers (e.g., ||content||) - Full spoiler in group 3, content in group 4
//    - Opening || must be followed by a non-whitespace character.
//    - Closing || must be preceded by a non-whitespace character (from the content side).
const tokenRegex = new RegExp(
  '(' + /:[a-zA-Z0-9_]+:/.source + ')|' +       // Group 1: Emoji
  '(' + /\bhttps?:\/\/\S+/.source + ')|' +        // Group 2: URL
  // Group 3: Full spoiler match (e.g., ||text||)
  // Group 4: Spoiler content (e.g., text)
  '(' + /\|\|(?!\s)(.+?)(?<!\s)\|\|/.source + ')',
  'g'
);

export function parseMessage(message: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let lastIndex = 0;

  for (const match of message.matchAll(tokenRegex)) {
    const startIndex = match.index!; // Should always be defined for matchAll results

    // Add preceding text if any
    if (startIndex > lastIndex) {
      parts.push({ text: message.substring(lastIndex, startIndex) });
    }

    const emoji = match[1];
    const url = match[2];
    const spoilerFull = match[3]; // The full spoiler token e.g. ||content||
    const spoilerContent = match[4]; // The actual content inside spoilers e.g. content

    if (emoji) {
      parts.push({ emoji });
    } else if (url) {
      parts.push({ url });
    } else if (spoilerFull) {
      parts.push({ spoilerContent: spoilerContent });
    }

    lastIndex = startIndex + match[0].length;
  }

  // Add any remaining text after the last match
  if (lastIndex < message.length) {
    parts.push({ text: message.substring(lastIndex) });
  }

  // Filter out any potential empty text parts (though current logic should prevent them)
  return parts.filter(part => !(part.text !== undefined && part.text.length === 0));
}


function isLocalUrl(url: string): boolean {
  try {
    const { origin } = new URL(url);
    return origin === location.origin;
  } catch (error) {
    return false;
  }
}
