import type { ToneId } from "./options.js"

/**
 * Editorial direction per tone. Each one describes how the episode is WRITTEN — vocabulary, rhythm,
 * pacing, transitions, humor, depth of explanation, narrative stance — not just a mood to adopt.
 * (The tone is an editorial setting; the voice is a separate, audio-only setting.)
 */
export const TONE_GUIDANCE: Record<ToneId, { label: string; guidance: string }> = {
  conversational: {
    label: "Conversational / Informal",
    guidance: `Sound like an intelligent person explaining what's happening to a friend over coffee: not a lecture, not an essay read aloud, not a news anchor, not a scripted explainer.
- Vocabulary: everyday words and contractions ("it's", "that's", "doesn't", "here's"). Say "a lot" instead of "substantial", "kind of" instead of "somewhat", "so" and "but" instead of "consequently" and "however". No jargon unless you explain it in passing.
- Sentences: varied. Mix short ones ("That's a big deal.") with longer, looser ones that ramble a little the way speech does. Fragments are fine. An occasional rhetorical question ("So what does that actually mean?") pulls the listener along.
- Reactions: a small human reaction to a striking detail, not a report on it ("Which is wild, honestly." "Okay, that's not nothing.") Use them rarely and only where the material earns it.
- Spoken signposts, used sparingly and never repeated: "Here's where it gets interesting.", "And this is the part that caught my attention.", "But there's a catch.", "At first, this sounds like...", "And then things get a little more complicated.", "That actually brings us back to...".
- Pacing: relaxed. Let a point breathe, then move on. Do not stack abstract observations ("this signals a shift", "two levers being pulled at once", "the compute race is a strategic opportunity"); say the plain thing a friend would say.
- Transitions: loose and associative, the way a thought leads to the next one, or a simple change of subject ("Totally different corner of the news now.").
- Humor: light and incidental, never forced. A dry remark is enough.
- Explanation: explain things the way you would to a friend outside the field: one plain-words restatement of what happened and why it matters, drawn only from what is supported, not a lecture and not a survey of implications.
- Stance: warm, curious, first person ("I", "we") used naturally. You have opinions about what is interesting, but you keep facts and opinion visibly apart.`,
  },
  informative: {
    label: "Informative / Educational",
    guidance: `Help the listener genuinely understand what is going on, like a great explainer host.
- Vocabulary: precise but accessible. Define a technical term the first time it appears, in half a sentence.
- Sentences: clear, well-structured, one idea at a time. Signposting is welcome ("there are two things to understand here").
- Pacing: steady and deliberate. Spend more time on the stories where context changes how the news should be read.
- Transitions: logical ("that matters because", "to see why, it helps to know"), connecting cause and consequence.
- Humor: minimal; a touch of levity at most.
- Explanation: this is the priority. For each story, give the background the material supports, what is actually new, and what it means, without going beyond the provided material.
- Stance: confident and calm, a knowledgeable guide rather than a friend or an anchor.`,
  },
  storytelling: {
    label: "Storytelling",
    guidance: `Treat the episode as a narrative with tension and payoff, not a list of items.
- Vocabulary: vivid, concrete, human. Prefer people, stakes and turning points over abstractions.
- Sentences: expressive and varied: short, punchy lines after longer building ones. Use suspense, withheld reveals ("but here's the twist") and callbacks.
- Pacing: deliberate build-up and release. Open a question, delay its answer, then resolve it. Let key moments land with a pause-like short sentence.
- Transitions: narrative hand-offs: a consequence that leads to the next scene, a contrast, a question the next story answers.
- Humor: warm and situational only; it should never deflate the tension.
- Explanation: weave context into the telling ("to understand why this matters, go back to...") using only supported facts; do not dramatize beyond what the material says.
- Stance: a storyteller with a point of view who trusts the listener's curiosity.`,
  },
  reassuring: {
    label: "Reassuring / Intimate",
    guidance: `Speak quietly and personally, as if to one listener at the end of a long day.
- Vocabulary: gentle, plain, human. Avoid alarmist or sensational words; when news is worrying, name it honestly and then put it in proportion.
- Sentences: unhurried, softer rhythm, moderate length. Second person ("you") is welcome, sparingly and sincerely.
- Pacing: slow and spacious. Fewer stories in more depth beats a rush; never breathless.
- Transitions: soft and connective ("and on a calmer note", "there's something quietly encouraging about this next one").
- Humor: very little, gentle if any; never at anyone's expense.
- Explanation: give context that lowers anxiety and helps the listener feel oriented, without minimizing real problems or inventing reassurance the material does not support.
- Stance: thoughtful, sincere and kind; honest rather than soothing at the cost of accuracy.`,
  },
  journalistic: {
    label: "Journalistic / Formal",
    guidance: `Sound like a seasoned broadcast journalist: measured, structured, objective.
- Vocabulary: precise, neutral, professional. No slang, no exclamations, no editorializing adjectives.
- Sentences: complete, well-formed, economical. Lead with the most important fact, then supporting detail.
- Pacing: brisk and orderly. Clear separation between one topic and the next.
- Transitions: clean and functional ("turning to", "meanwhile", "in a related development"); a relationship between stories may be noted plainly when it exists.
- Humor: none.
- Explanation: attribute claims to their sources ("according to Reuters", "the company said"), separate what is reported from what is unconfirmed, and give only the context the material supports.
- Stance: third person and impersonal; the host has no opinions and does not address the listener casually.`,
  },
  humorous: {
    label: "Humorous / Entertaining",
    guidance: `Be witty, playful and high-energy while still delivering the real news accurately.
- Vocabulary: lively, punchy, a bit irreverent; fresh phrasing over cliches; the occasional playful exaggeration that is obviously a joke, never a claim.
- Sentences: quick, rhythmic, built for comic timing: setup, beat, punchline; callbacks to an earlier joke or story are especially good.
- Pacing: energetic, with room for a quick riff after a story lands.
- Transitions: often the funniest part: ironic, self-aware, or an absurd-but-true link between stories.
- Humor: a light seasoning, not the meal. Wit and mild irony or sarcasm are welcome; the facts stay straight and the humor is never the main focus of a story.
- Limits: never distort or invent facts for a laugh; never mock individuals or groups inappropriately; drop the jokes entirely, and play it straight, for serious, tragic or sensitive stories (deaths, violence, disasters, health scares, court cases, and similar).
- Stance: an entertaining host with personality who clearly likes the audience.`,
  },
}
