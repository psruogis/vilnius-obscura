# Music in the walk

**There is no music everywhere.** Music belongs to places (`src/audio/zones.ts`): it is heard only near its source,
and nowhere else. The listed zones are in `public/assets/music/tracks.json` (read by `src/audio/manifest.ts`), and each
streams from an `<audio>` element, so nothing is fetched until the walker comes near. The player's **Music** slider
(Options > Sound) sets its level. `M` (mute) silences it.

## How a zone sounds

As the walker nears one of a zone's `sites` (metres east and south of the Town Hall, the map's x and z) the recording
fades in along a smooth curve between `far` and `near` metres, panned towards the site and muffled with distance, as if
from a courtyard or an upper window. It is gone behind you; the stream is paused 12 s after you are out of earshot. The
zone's files follow one another while you are in earshot. `level` (0 to 1) is how loud it is at best, `height` how high
above the ground it comes from.

## The rule: free in Europe, not only in the US

The owner is in Europe, so a file is used only if it is free to use there: **the recording is over 70 years old or was
released to the public domain (CC0) by its performers, and the composer died over 70 years ago** (or the tune is
traditional). "Public domain in the US" is not enough: the 100-year US rule frees a 1924 record whose tune may still be
in copyright in Europe. Each file is listed in `CREDITS.md` with where it came from.
Checked and **refused** for this reason: Naftule Brandwein's 1924 Victor discs (US-only), and Joseph Moskowitz's
"Panama Pacific Drag" (1916; its composer, Leo Edwards, died in 1978).

## The klezmer zone, `jewish-quarter-west`

Four dances by Harry Kandel's Orchestra (Victor, recorded 6 May 1921). Two sites: the west edge of the walk (x −125,
z −6, where Vokiečių g. meets Mėsinių g.: the German Street and the edge of the Jewish quarter) and the north edge
(x 5, z −140, towards Stiklių g.). Loudest within 25 m of a site, gone beyond 80 m. From the square, and from the start,
you hear nothing; on the west end of Vokiečių g. a hint; at the west edge, clearly.

- The Jewish quarter began at the square's western edge (Vokiečių, Žydų, Stiklių, Mėsinių): see
  `docs/research/city-1900.md` §2 [U, design]. Yiddish was the native language of 40% of the city in 1897 [V], same file.
- Klezmer as the music of Jewish weddings and streets in Eastern Europe [V, general history]:
  [Klezmer (Wikipedia)](https://en.wikipedia.org/wiki/Klezmer).
- **[U]** that this band sounds like Vilna's. It is a New York band of 1921, two decades after the setting; the dances
  (bulgar, freylekhs) belong to the Eastern European tradition, and nothing ties these discs to Vilna. All the walk
  claims is that klezmer was heard in the Jewish quarter.
- Harry Kandel (c. 1885–1943), clarinettist and bandleader, recorded for Victor 1916–1927
  ([Wikipedia](https://en.wikipedia.org/wiki/Harry_Kandel)). The Library of Congress credits him only as leader and
  arranger on these four sides, with no composer: traditional tunes. [U]: not checked against a catalogue.

## History of this file

A first version also played three Chopin pieces (Musopen recordings, public domain) quietly under the whole walk, and
then as a piano from a window on the east side. The owner asked for klezmer only, and the Chopin was removed.

## Adding music

1. Find a recording that meets the rule above. Read its licence page, not only its tag.
2. Convert it to mp3 (72–96 kbps), loudness about −20 LUFS (`loudnorm=I=-20:TP=-2`), with a short fade in and out
   (`afade`).
3. Put it in `public/assets/music/`, add it to a zone's `files` in `tracks.json` (or a new zone: `id`, `files`,
   `sites`, `near`, `far`), add a row to `CREDITS.md` and a line to the credits in `src/ui/overlay.ts`.
4. Keep `far` below about 100 m so the walker leaves it behind.

## Not yet

- A German Street zone of its own (a chorale from the Lutheran church, a brass band) [U]: nothing chosen.
- A piece by a composer of the place: Čiurlionis (lived in Vilnius 1907–09) or Moniuszko. No free recording was found.
