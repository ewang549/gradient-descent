-- Sanity bounds per season. Teams have gone for it on roughly 10-25% of 4th downs in the
-- modern era, and a game has about 12-16 fourth-down decisions. Way outside these ranges
-- means the decision classification broke, not that football changed.
select
    season,
    count(*)                              as decisions,
    count(distinct game_id)               as games,
    avg(is_go::int)                       as go_rate
from {{ ref('fct_fourth_downs') }}
group by season
having avg(is_go::int) not between 0.05 and 0.35
    or count(*) / count(distinct game_id) not between 8 and 20
