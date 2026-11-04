-- Field-goal model rows: every FG attempt on any down (blocked kicks count as misses).
-- Weather: none indoors or under an open retractable roof (nflverse doesn't record it there);
-- outdoors, missing readings (3% of games) fall back to the outdoor medians, 8 mph and 59F.

select
    play_uid,
    game_id,
    season,
    week,
    posteam,
    kick_distance,
    is_indoors::int                                                     as is_indoors,
    coalesce(surface_type = 'turf', false)::int                         as is_turf,
    if(is_indoors or roof = 'open', 0, coalesce(wind_mph, 8))           as wind_mph,
    if(is_indoors or roof = 'open', 70, coalesce(temp_f, 59))           as temp_f,
    (field_goal_result = 'made')::int                                   as label_made

from {{ ref('fct_plays') }}
where play_type = 'field_goal'
  and kick_distance between 18 and 70   -- a handful of 70+ "attempts" are data errors
