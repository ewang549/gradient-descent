-- stg_participation: offensive personnel and formation per play, 2016-2025.
-- Joins to stg_pbp on play_uid. Not published for the current season.

select
    nflverse_game_id || '_' || cast(cast(play_id as integer) as varchar) as play_uid,
    nflverse_game_id                                                     as game_id,
    cast(play_id as integer)                                             as play_id,
    cast(left(nflverse_game_id, 4) as integer)                           as season,
    nullif(offense_formation, '')                                        as offense_formation,
    nullif(offense_personnel, '')                                        as offense_personnel,
    defenders_in_box,
    nullif(defense_personnel, '')                                        as defense_personnel,
    n_offense,
    n_defense
from {{ source('raw', 'participation') }}
