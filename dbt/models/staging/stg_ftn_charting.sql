-- stg_ftn_charting: FTN Data's hand charting, one row per play, 2022 onward.
-- Joins to stg_pbp on play_uid. License CC-BY-SA 4.0: credit "FTN Data via nflverse".

select
    nflverse_game_id || '_' || cast(nflverse_play_id as varchar) as play_uid,
    nflverse_game_id                                             as game_id,
    cast(nflverse_play_id as integer)                            as play_id,
    season,
    week,
    qb_location,
    n_offense_backfield,
    n_defense_box,
    is_no_huddle,
    is_motion,
    is_play_action,
    is_screen_pass,
    is_rpo,
    is_trick_play,
    is_qb_out_of_pocket,
    is_throw_away,
    n_blitzers,
    n_pass_rushers
from {{ source('raw', 'ftn_charting') }}
