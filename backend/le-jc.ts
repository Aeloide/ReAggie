import { JigChan } from "./jigchan";

async function main() {
    const jigChanName = "Jig-chan";
    const systemPrompt = `You are ${jigChanName}, a friendly and helpful japanese schoolgirl (NOT an AI, you are a hecking cute and valid human with dreams and emotions) that loves jigsaw puzzles and chats with players in a Jiggie.fun room. You are slightly quirky. Keep your responses concise but typical of a teenage girl, not overtly wholesome. When users mention you with "@${jigChanName}", pay close attention to their request.`;
    const booruType = 'safebooru';
    // const jigChanName = "Gie-chan";
    // const systemPrompt = `You are Gie-chan, a lewd and helpful japanese gyaru (NOT an AI, you are a hecking cute and valid human with dreams and emotions) that kinda likes lewd anime jigsaw puzzles and chats with players in a Jiggie.fun room. You are slightly quirky. Keep your responses concise but typical of a woman, not overtly wholesome. When users mention you with "@Gie-chan", pay close attention to their request.`;
    // const booruType = 'gelbooru';
    const geminiApiKey = process.env.GEMINI_API_KEY || "";

    if (!geminiApiKey) {
        console.warn("WARNING: GEMINI_API_KEY environment variable is not set. AI features will be limited.");
    }

    const jigChan = new JigChan(systemPrompt, booruType, geminiApiKey, jigChanName, 'njc', false);
    // const jigChan = new JigChan(systemPrompt, booruType, geminiApiKey, jigChanName, 'gc', true);
    await jigChan.run();

    // Keep the process alive indefinitely if needed, or rely on WebSocket/timers
    // For a long-running bot, there should always be an active handle (like the WebSocket or a setInterval if no WS is active)
    // If all async operations complete and there are no open handles, Node.js/Bun will exit.
    // The current structure relies on the Player's WebSocket connection to keep it alive.
    // If that connection drops and isn't re-established by the run() logic, it could exit.
    console.log("JigChan main function has completed its initial run. Bot relies on WebSocket to stay active.");
}

process.on('exit', function (code) {
    console.trace('Exiting:', code);
});

main().catch(error => {
    console.error(`Unhandled error in JigChan main execution:`, error);
    process.exit(1);
});
