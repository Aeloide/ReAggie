/**
 * Represents a parsed MP4 box.
 */
interface Box {
    type: string;        // The 4-character code for the box type (e.g., 'moov', 'hvc1').
    size: number;        // Full size of the box in bytes, including the header.
    contentOffset: number; // Offset from the start of the ArrayBuffer to the box's content (after size and type).
    contentSize: number; // Size of the box's content in bytes.
    boxOffset: number;   // Offset from the start of the ArrayBuffer to the box's header (where size is read).
}

let logger = {
    log(...args: any[]) {console.log(...args)},
    warn(...args: any[]) {console.warn(...args)},
};

/**
 * Helper function to convert a sequence of bytes from a DataView into a string.
 * @param view The DataView instance to read from.
 * @param offset The offset in the DataView to start reading.
 * @param length The number of bytes to read and convert to a string.
 * @returns The resulting string.
 */
function getString(view: DataView, offset: number, length: number): string {
    let result = "";
    for (let i = 0; i < length; i++) {
        if (offset + i >= view.byteLength) { // Boundary check
            logger.warn(`getString: Attempted to read past buffer end at offset ${offset + i}`);
            break;
        }
        result += String.fromCharCode(view.getUint8(offset + i));
    }
    return result;
}

/**
 * Generator function to iterate over MP4 boxes within a given range of an ArrayBuffer.
 * @param view The DataView instance wrapping the MP4 file's ArrayBuffer.
 * @param startOffset The offset within the DataView to start parsing boxes.
 * @param parentEndOffset The offset marking the end of the current parsing context (e.g., end of parent box or file).
 * @yields {Box} An object representing each parsed box.
 */
function* iterateBoxes(view: DataView, startOffset: number, parentEndOffset: number): Generator<Box> {
    let currentOffset = startOffset;
    while (currentOffset < parentEndOffset - 7) { // Minimum 8 bytes for a basic box (4 size + 4 type)
        const boxOffset = currentOffset;
        let boxSize = view.getUint32(currentOffset, false); // Big-endian
        const boxType = getString(view, currentOffset + 4, 4);
        
        let headerSize = 8; // Default header size for 32-bit size

        if (boxSize === 1) { // 64-bit extended size follows type
            if (currentOffset + 16 > parentEndOffset) {
                logger.warn(`Box ${boxType} at ${currentOffset}: Not enough data for 64-bit extended size header.`);
                return; // Malformed or truncated
            }
            boxSize = Number(view.getBigUint64(currentOffset + 8, false)); // Read 64-bit size
            headerSize = 16;
        } else if (boxSize === 0) { // Box extends to the end of the current parsing context (parent box or file)
            boxSize = parentEndOffset - currentOffset;
        }

        if (boxSize < headerSize) {
            logger.warn(`Box ${boxType} at ${currentOffset}: Invalid box size ${boxSize} (header is ${headerSize}). Possible corruption or padding.`);
            // If size is invalid, cannot reliably proceed with this box or subsequent boxes at this level.
            return; 
        }
        
        const contentOffset = currentOffset + headerSize;
        const contentSize = boxSize - headerSize;

        // Ensure the calculated end of the box does not exceed its parent's boundary
        if (currentOffset + boxSize > parentEndOffset) {
            logger.warn(`Box ${boxType} at ${currentOffset} with calculated end ${currentOffset + boxSize} exceeds parent boundary ${parentEndOffset}.`);
            return; // Malformed
        }

        yield { type: boxType, size: boxSize, contentOffset, contentSize, boxOffset };

        currentOffset += boxSize; // Move to the next box
    }
}

/**
 * Parses the Sample Description Box (stsd) to find HEVC sample entries.
 * @param view The DataView instance.
 * @param stsdContentOffset Offset to the content of the 'stsd' box.
 * @param stsdContentEndOffset End offset of the 'stsd' box's content.
 * @returns True if an HEVC sample entry is found, false otherwise.
 */
function parseStsdForHevc(view: DataView, stsdContentOffset: number, stsdContentEndOffset: number): boolean {
    // 'stsd' box structure: version (1 byte), flags (3 bytes), entry_count (4 bytes)
    if (stsdContentOffset + 8 > stsdContentEndOffset) {
        logger.warn("stsd box too small for header.");
        return false; 
    }
    
    const entryCount = view.getUint32(stsdContentOffset + 4, false); // Number of sample entries
    let currentSampleEntryOffset = stsdContentOffset + 8;

    for (let i = 0; i < entryCount; i++) {
        // Each sample entry starts with: size (4 bytes), format (4 bytes)
        if (currentSampleEntryOffset + 8 > stsdContentEndOffset) {
            logger.warn("Not enough data for sample entry header in stsd.");
            return false; 
        }
        const sampleSize = view.getUint32(currentSampleEntryOffset, false);
        if (sampleSize < 8) { // Sample entry must be at least 8 bytes for size and format
            logger.warn(`Sample entry ${i} in stsd has invalid size ${sampleSize}.`);
            return false; // Malformed
        }
        const sampleFormat = getString(view, currentSampleEntryOffset + 4, 4);
        logger.log(`  Found Sample Format: ${sampleFormat}`);

        if (sampleFormat === 'hvc1' || sampleFormat === 'hev1') {
            return true; // HEVC codec type found directly
        }

        // Check for 'hvcC' (HEVC Decoder Configuration Box) within this sample entry.
        // This can be present even if the sampleFormat is more generic or encrypted.
        // The content of the sample entry starts after its 8-byte header (size + format).
        const sampleEntryContentStart = currentSampleEntryOffset + 8;
        const sampleEntryContentEnd = currentSampleEntryOffset + sampleSize;

        if (sampleSize > 8) { // Only if there's content beyond the basic header
             for (const childBox of iterateBoxes(view, sampleEntryContentStart, sampleEntryContentEnd)) {
                if (childBox.type === 'hvcC') {
                    return true; // HEVC configuration box found
                }
                // Handle encrypted video ('encv') potentially wrapping HEVC
                if (sampleFormat === 'encv' && childBox.type === 'sinf') { // Scheme Information Box
                    for (const sinfSubBox of iterateBoxes(view, childBox.contentOffset, childBox.contentOffset + childBox.contentSize)) {
                        if (sinfSubBox.type === 'frma') { // Original Format Box
                            if (sinfSubBox.contentSize >= 4) {
                                const originalFormat = getString(view, sinfSubBox.contentOffset, 4);
                                if (originalFormat === 'hvc1' || originalFormat === 'hev1') {
                                    return true; // Original format was HEVC
                                }
                            }
                        }
                    }
                }
            }
        }
        
        currentSampleEntryOffset += sampleSize; // Move to the next sample entry
        if (currentSampleEntryOffset > stsdContentEndOffset) {
            logger.warn("Sample entry parsing went out of stsd box bounds.");
            return false; 
        }
    }
    return false;
}

/**
 * Parses the Sample Table Box (stbl) to find the Sample Description Box (stsd).
 * @param view The DataView instance.
 * @param stblContentOffset Offset to the content of the 'stbl' box.
 * @param stblContentEndOffset End offset of the 'stbl' box's content.
 * @returns True if HEVC is detected in a child 'stsd' box, false otherwise.
 */
function parseStblForHevc(view: DataView, stblContentOffset: number, stblContentEndOffset: number): boolean {
    for (const box of iterateBoxes(view, stblContentOffset, stblContentEndOffset)) {
        if (box.type === 'stsd') {
            logger.log(" Found 'stsd' box.");
            if (parseStsdForHevc(view, box.contentOffset, box.contentOffset + box.contentSize)) {
                return true;
            }
            // Typically one 'stsd' per 'stbl', but loop continues if structure is unusual.
        }
    }
    return false;
}

/**
 * Parses the Media Information Box (minf) to find the Sample Table Box (stbl).
 * @param view The DataView instance.
 * @param minfContentOffset Offset to the content of the 'minf' box.
 * @param minfContentEndOffset End offset of the 'minf' box's content.
 * @returns True if HEVC is detected in a child 'stbl' box, false otherwise.
 */
function parseMinfForHevc(view: DataView, minfContentOffset: number, minfContentEndOffset: number): boolean {
    for (const box of iterateBoxes(view, minfContentOffset, minfContentEndOffset)) {
        if (box.type === 'stbl') {
            logger.log(" Found 'stbl' box.");
            if (parseStblForHevc(view, box.contentOffset, box.contentOffset + box.contentSize)) {
                return true;
            }
            // Typically one 'stbl' per 'minf'.
        }
    }
    return false;
}

/**
 * Parses a Track Box (trak) to determine if it's a video track and if it contains HEVC.
 * @param view The DataView instance.
 * @param trakContentOffset Offset to the content of the 'trak' box.
 * @param trakContentEndOffset End offset of the 'trak' box's content.
 * @returns True if this track is a video track containing HEVC, false otherwise.
 */
function parseTrakForHevc(view: DataView, trakContentOffset: number, trakContentEndOffset: number): boolean {
    let isVideoTrack = false;
    let minfBox: Box | null = null;

    // First pass within 'trak' to find 'mdia' and then check 'hdlr' and find 'minf'
    for (const trakSubBox of iterateBoxes(view, trakContentOffset, trakContentEndOffset)) {
        if (trakSubBox.type === 'mdia') { // Media Box
            logger.log("Found 'mdia' box.");
            let currentMdiaIsVideo = false;
            let currentMdiaMinfBox: Box | null = null;

            for (const mdiaSubBox of iterateBoxes(view, trakSubBox.contentOffset, trakSubBox.contentOffset + trakSubBox.contentSize)) {
                if (mdiaSubBox.type === 'hdlr') { // Handler Reference Box
                    // 'hdlr' structure: version(1), flags(3), pre_defined(4) or component_type(4), handler_type(4)
                    if (mdiaSubBox.contentSize >= 12) { // Enough data for handler_type
                        const handlerType = getString(view, mdiaSubBox.contentOffset + 8, 4);
                        logger.log(` Handler type: ${handlerType}`);
                        if (handlerType === 'vide') { // 'vide' for Video Track
                            currentMdiaIsVideo = true;
                        }
                    }
                } else if (mdiaSubBox.type === 'minf') { // Media Information Box
                    currentMdiaMinfBox = mdiaSubBox;
                }

                // Optimization: if we've found both hdlr (and it's video) and minf, we can stop searching this mdia
                if (currentMdiaIsVideo && currentMdiaMinfBox) {
                    break;
                }
            }

            if (currentMdiaIsVideo && currentMdiaMinfBox) {
                logger.log(" Found video track's 'minf' box.");
                if (parseMinfForHevc(view, currentMdiaMinfBox.contentOffset, currentMdiaMinfBox.contentOffset + currentMdiaMinfBox.contentSize)) {
                    return true; // HEVC found in this video track
                }
            }
            // A 'trak' usually has one 'mdia'. If HEVC not found in this one, unlikely in others within same 'trak'.
            // However, the loop will continue if there are multiple 'mdia' boxes.
        }
    }
    return false;
}

/**
 * Detects if an MP4 file contains an HEVC (H.265) encoded video stream.
 * @param file The MP4 file object (standard DOM File API).
 * @returns A Promise that resolves to true if HEVC is detected, false otherwise.
 */
export async function isMp4Hevc(file: File): Promise<boolean> {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);

    // It's good practice to check 'ftyp' (File Type Box) to confirm MP4,
    // but the core logic relies on finding HEVC in track descriptions.
    // Some MP4-like files might lack 'ftyp' or have non-standard brands.
    // For this function, we'll proceed to look for 'moov' regardless,
    // as 'moov' contains the essential metadata.

    // Iterate through top-level boxes to find 'moov' (Movie Box)
    for (const topBox of iterateBoxes(view, 0, view.byteLength)) {
        if (topBox.type === 'moov') {
            logger.log("Found 'moov' box.");
            // Iterate through 'trak' (Track Box) boxes within 'moov'
            for (const trakBox of iterateBoxes(view, topBox.contentOffset, topBox.contentOffset + topBox.contentSize)) {
                if (trakBox.type === 'trak') {
                    logger.log("Found 'trak' box.");
                    if (parseTrakForHevc(view, trakBox.contentOffset, trakBox.contentOffset + trakBox.contentSize)) {
                        return true; // HEVC found in one of the tracks
                    }
                }
            }
            // If 'moov' is processed and no HEVC found, no need to check other top-level boxes.
            return false;
        }
    }

    logger.log("'moov' box not found or no HEVC track identified.");
    return false; // 'moov' box not found, or HEVC not found in any track
}

// Example Usage (typically in a browser environment):
//
// async function handleFileSelect(event: Event) {
//     const input = event.target as HTMLInputElement;
//     if (input.files && input.files.length > 0) {
//         const file = input.files[0];
//         logger.log(`Checking file: ${file.name}`);
//         try {
//             const isHevc = await isMp4Hevc(file);
//             if (isHevc) {
//                 logger.log(`${file.name} contains an HEVC video stream.`);
//             } else {
//                 logger.log(`${file.name} does not contain an HEVC video stream (or is not a recognized MP4).`);
//             }
//         } catch (error) {
//             console.error("Error checking file:", error);
//         }
//     }
// }
//
// // <input type="file" accept="video/mp4,.mp4" onchange="handleFileSelect(event)">
