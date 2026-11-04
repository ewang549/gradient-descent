-- Leakage guard: pre-game team strength may only use games played strictly before this one.
-- If someone changes a window frame to include `current row`, this fails immediately.
select team_game_uid, game_date, last_8_window_end_date
from {{ ref('int_team_strength') }}
where last_8_window_end_date >= game_date
