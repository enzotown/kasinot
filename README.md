# Kasinot

Ett litet tur- och statistikspel för barn 4–6 år, med Kotten. Tre maskiner i samma
skärm: **HJUL**, **TÄRNING** och **KORT**. Man trycker på den stora knappen och ser
vad som händer – och efter varje drag fylls stapeldiagrammet längst ner på hur många
gånger varje sak har kommit.

Inget kan förloras, inget kostar pengar, ingen reklam och inget som sparas om barnet.

## Så spelar man

1. Välj maskin med flikarna högst upp.
2. På hjulet: tryck på den färg du tror kommer upp – "Vilken tror du?". Sedan på den
   stora runda knappen (SNURRA / SLÅ / DRA).
3. Titta vad det blev – ordet står kvar ovanför knappen. Gissade du? Då står det
   "Du gissade rätt!" eller "Du gissade fel" ovanför färgerna, och sammanfattningen
   efter tolv drag räknar hur många gissningar som stämde.
4. Efter tolv drag kommer en liten sammanfattning: vad som kom oftast, och alla
   resultat i stapeldiagrammet. Tryck **IGEN** för att börja om.
5. Frågetecknet högst upp berättar vad statistik är: att räkna hur många gånger något
   kommer upp. Många drag – alla färger ungefär lika ofta. Ett enda drag – liten chans
   att gissa rätt (lika liten som ketchup på glassen eller korv med sylt).

## Teknik

- Ren HTML, CSS och JavaScript på en `<canvas>` (ingen p5.js, inga beroenden).
- Allt ritas i en enda renderloop, alla tryckytor är minst 44 px.
- Ljud via WebAudio (korta toner, inga filer).
- Service worker cachar appen så den startar utan nät (registreras bara på https).
- Stjärnorna sparas i `localStorage` på enheten (bara en siffra, inget om barnet).

## På iPad

Spelet är byggt för pekskärm: landskap 1194×834, porträtt 834×1194 och mobil
390×844 är provspelade. Inga hovrings­effekter, inga små kryss, ingen text som
måste läsas för att komma vidare.

## Provkör lokalt

```bash
python3 -m http.server 8133
# öppna http://127.0.0.1:8133/
```

## Live

https://kasinot.shipholm.dev — byggs från `enzotown/kasinot` och deployas vid push.

## Lärarhandledning

`larare.html` kopplar spelet till Lgr22 (matematik: sannolikhet och statistik,
årskurs 1–3).