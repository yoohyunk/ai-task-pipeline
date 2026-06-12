# Google Doc — meeting transcript (demo prop)

The Sprint Planning transcript shown in the recording, matching
`fixtures/meet-transcript.json` (used in fixtures mode). The opening small talk is
kept on purpose, so you can see the extractor ignore the chatter and pull only the
real action items.

---

**Sprint Planning - Transcript**
Jun 5, 2026

00:00:04
Eric Frazier: Hello.
Erica Kim: Hello.
Eric Frazier: Can you hear me? I'm having some weird issues with devices, my camera failed to start for whatever reason.
Erica Kim: Yes, I can hear you.
Eric Frazier: Did you see the list I sent on Slack recently?

00:00:31
Erica Kim: Yeah. Alright, let's run through it. First, the auth service refactor. That PR's still not merged and it's been sitting for two weeks. What's blocking it?

00:00:47
Angelo: That's on me. The code's done, I just still need to add integration tests before it can go in. I'll get to it by end of week.

00:01:10
Erica Kim: Okay, let's make sure it lands this sprint. Next, the API rate limiting we talked about last sprint still isn't implemented. It's honestly a security risk at this point, anyone can hammer the endpoints.

00:01:28
Angelo: Yeah, we should close that out. Can you take it?
Erica Kim: I'll pick it up, and I'll document the limits in the API docs too so it's not just tribal knowledge.

00:01:50
Angelo: One more thing before we wrap, the error monitoring dashboard hasn't been updated since we switched to the new logger. It's showing wrong data, so people are starting to ignore it.
Erica Kim: Can you fix that one?
Angelo: Yeah, I'll fix the dashboard config this sprint and repoint it at the new logger.

00:02:13
Erica Kim: Great. So, auth PR merged with tests on you, rate limiting plus docs on me, dashboard fix on you. Thanks.

Transcription ended after 00:02:13

---

Action items the pipeline should extract: merge the auth PR with integration
tests (Angelo), implement API rate limiting and document the limits (Erica), fix
the error monitoring dashboard config (Angelo).
