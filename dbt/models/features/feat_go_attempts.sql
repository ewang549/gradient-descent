-- Conversion model rows: 4th-down go-for-it attempts where the snap counted.
-- Fakes are excluded (they convert at a surprise-inflated rate a normal attempt can't count on).

select
    play_uid,
    game_id,
    season,
    week,
    posteam,
    defteam,
    ydstogo,
    yardline_100,
    is_goal_to_go::int                                  as is_goal_to_go,
    posteam_off_epa_last_8,
    defteam_def_epa_last_8,
    is_indoors::int                                     as is_indoors,
    coalesce(surface_type = 'turf', false)::int         as is_turf,  -- unknown surface (1% of games) -> grass
    is_converted::int                                   as label_converted,
    yards_gained

from {{ ref('fct_fourth_downs') }}
where decision = 'go'
  and not is_nullified_by_penalty
  and not is_fake_kick
