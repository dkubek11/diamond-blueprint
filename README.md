# Diamond Blueprint

A full-stack baseball scouting application that tells pitchers what to throw next and why.

---

As an aspiring sports data analyst, I wanted to understand what actually goes into pitch sequencing at the MLB level. Not just what pitch was thrown, but why, and whether the data could tell you what should come next. I think when it comes to pitching it should be a healthy balance of looking at the numbers while also going by the flow of an at bat based on what a pitcher might be feeling.

Over the past several weeks I built a full-stack baseball scouting application powered by Statcast pitch-by-pitch data. It pulls every pitch thrown in the 2026 season and can be used for custom matchups or to look at each day's games and lineups. I created a custom scoring engine that ranks pitch recommendations using run value, whiff rate, chase rate, called strike rate, and xwOBA on contact, each weighted differently depending on the count. On top of the base score I added three modifiers that I felt were important: a head-to-head modifier based on how the pitcher has historically performed against that specific batter, a sequencing modifier that accounts for what happened on the previous pitch (if the batter just missed a slider, pitches that tunnel off it get a boost, if they barreled a fastball it gets penalized), and a movement modifier that determines if a pitch has a specific advantage based on the pitcher's IVB, HB, and spin rate versus that particular batter.

On top of the core recommendations I added a situation goal feature that re-ranks pitches based on the game situation, whether you need a strikeout, a ground ball for a double play, or weak contact. The site also has hot and cold zones based on the past 20 games along with a pitch vulnerability breakdown showing what hitters are doing to each pitch in a pitcher's arsenal. It can also be used in game by logging pitches in real time. Built with a Python and FastAPI backend powered by real MLB Statcast data, stored and queried through a PostgreSQL database.

---

## Built With

- **Backend:** Python, FastAPI, SQLAlchemy, Statcast / pybaseball, MLB Stats API
- **Frontend:** React, Vite
- **Database:** SQLite (local), Neon Postgres (production)
