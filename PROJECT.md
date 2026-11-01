# 言葉の鎖 · Kanji Study

A small game for learning Japanese words the way they are actually met: in context, linked to other words, a few minutes at a time.

## The spirit of the app

Learning a language should feel like moving forward. Every session, however short, should leave you knowing a bit more than before and seeing clearly how far you have come.

The app is built around a few beliefs:

- **Words live in families.** Nobody meets 改札 alone: it comes with 駅, ホーム, 乗り換え and 定期券. Words learned together, in a setting, support each other and stick better.
- **Short sessions are real sessions.** A run fits a ten-minute train ride. It starts at once, ends when you choose, and stopping never costs you anything.
- **Progress should be visible and close.** Instead of a distant finish line, the app shows the next step: "+3 words and this theme is mastered".
- **What you already know counts from the start.** If you know the basics, the app moves past them fast and spends your time on what is new.
- **Following ideas is more fun than flipping cards.** Each answer leads to the next word, so a session feels like a walk through the language rather than a pile of cards.

## What it does differently

Flash card study works well for many people, and spaced repetition is a great idea. This app keeps that idea and changes the parts that tend to wear motivation down.

| Common pain | What the app does instead |
|---|---|
| Words arrive in random order, with no link between one card and the next. | Words come in themes, and every question connects to the previous answer. |
| Time away builds a review backlog that has to be cleared before anything new. | A run has a fixed length (20 questions by default). Weak words come back more often, but nothing piles up. |
| Everyone starts at the very beginning and repeats words they already know. | A word you answer right on first sight starts with credit, and words you know well step aside quickly. |
| Progress is a count of reviews, which says little about what you can actually use. | Progress is counted per theme, in words you know, against a goal you set (80, 90 or 95%). |
| Learning means memorising parts and stories before reaching real words. | You work with real, common words from the first question. |

The idea comes from [chordflash](https://github.com/cerebraljam/chordflash), a guitar practice app built on chord transitions. It lists the songs you can already play and the ones that need just one more chord. That "+1 and you have it" feeling is what this app tries to bring to vocabulary.

## How a run works

A word is shown with one question. There are five question types:

| Symbol | Question | What happens next |
|---|---|---|
| 意 | What does it mean? | stays on the word |
| 読 | How is it read? | stays on the word |
| 関 | Which is most related? | moves to the answer |
| 同 | Which means the same? | moves to the answer |
| 反 | Which is the opposite? | moves to the answer |

Moving questions build a **chain**: the answer becomes the next word. A trail shows the last steps. A right answer is drawn in green; a wrong one forks, showing your pick in red with its meaning, and the right answer in green. The chain carries on from the right answer, so a mistake turns into the next lesson instead of a dead end.

New words are introduced on the way, a few per run, with a quick look and an easy check, so you never have to sit through a lesson first.

Reading aids adapt to you. You say what you can read (hiragana, katakana), and the app adds furigana or romaji only where they help, never on reading questions.

## How the themes are made

There are 674 themes over about 13,000 words. Designing that many topics by hand would be impossible, so most of them are discovered from the words themselves, then reviewed.

1. **Choose the vocabulary.** We start from JMdict, a free Japanese–English dictionary. Every word on a JLPT list is kept, plus words common in real text (measured with wordfreq). Rare spellings, archaic senses and grammar particles are left out. Example sentences come from Tatoeba.
2. **Give each word two kinds of position.**
   - A *topic* position, from fastText word vectors trained on Japanese text. Words that appear in the same kind of writing end up close together: 選挙, 投票 and 候補. This measures "belongs to the same subject".
   - A *meaning* position, from a multilingual sentence model (e5) applied to the English definitions. This measures "means the same thing", and is used only for synonyms.
3. **Find natural groups.** Each word is linked to the words closest to it by topic, keeping only links that hold in both directions. Community detection (the Louvain method) then splits this network into tight clusters. Each cluster is named after the words nearest its centre.
4. **Review every group.** Each discovered group was read and either kept, split into clearer themes or rejected, then named and placed in one of five categories:
   - 暮らし daily life: the konbini, dining out, finding a flat, catching a cold
   - 仕事 work: meetings, accounting, job hunting
   - 社会 society: elections, disasters, temples and shrines
   - 考え ideas: chance and necessity, means and ends, dreams and reality
   - 言葉 the language itself: verb families, adverb sets, connectives, honorific verbs
5. **Fill the gaps.** Very general words (する, 好き, 必要) belong to every topic, so clustering cannot place them. They are gathered into *essentials* themes by level and part of speech ("N5 verbs", "N4 adjectives"), so the basics are never left out. A few hand-made themes (the konbini, the station, information security) sit alongside the discovered ones.
6. **Draw the links.**
   - 関 related: each word's closest topic neighbours.
   - 同 synonyms: words whose meanings are nearly identical and share a main gloss.
   - 反 opposites: from the dictionary, plus pairs reviewed by hand (先輩 ↔ 後輩, 楽観的 ↔ 悲観的).
   - Drift links: bridges between neighbouring themes, so a run can wander from one topic into the next.
7. **Check it.** Automated tests validate the dataset (no broken links, no duplicate words, every reading in hiragana, no theme too small, every word in a theme) and play simulated learners through it, to confirm the score never claims more than they really know.

All of this happens before deployment. The app ships a single static data file and needs no server.

## What we expect from it

- **Context helps memory.** Meeting 投票 right after 選挙, and before 候補, ties each word to the others. Remembering one helps recall the rest.
- **Mastery spreads.** Progress is counted in words, and words belong to several themes. Studying the station also raises 通勤, 旅行 and 駅前. You will see themes you never opened start to fill up, a pleasant surprise and a good hint about what to try next.
- **Next steps are easy to find.** Home lists the themes closest to mastery and, for newcomers, the easiest places to start. The end of each run shows which themes are now within reach.
- **The game grows with you.** As a theme becomes familiar, related questions reach further out, into neighbouring themes, so you drift naturally into new topics instead of being sent there.
- **Abstract words get a home.** Ideas like 偶然 and 必然, or 本音 and 建前, are hard to learn alone. Grouped with their companions, they become a small, memorable family.
- **Short sessions add up.** With no backlog and every run counted, a ten-minute ride is always worth opening the app for.

## Principles for the build

- **Client only.** A static site on GitHub Pages; the app is about 36 KB plus the dataset.
- **Your progress stays yours.** It lives in the browser's local storage. Saves are versioned and migrated between app versions, and can be exported as a backup.
- **Personal lists stay private.** You can import your own word list (for work, for example) as a "My list". It stays on your device.
- **Fast.** The app is ready in under a second, and each question is prepared in under a millisecond.
- **Obvious controls.** Clear buttons, keyboard shortcuts on desktop, no hidden gestures.

## Credits

Words and meanings from [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) (EDRDG), JLPT levels from Jonathan Waller's lists, example sentences from [Tatoeba](https://tatoeba.org), word frequencies from [wordfreq](https://github.com/rspeer/wordfreq), and topic vectors from [fastText](https://fasttext.cc).
