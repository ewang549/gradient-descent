-- Where the receiving team starts after a kickoff, by season: the state after any score.
-- Data-driven on purpose, because kickoff rules keep changing (touchback to the 25 in 2016,
-- dynamic kickoff in 2024, touchback to the 35 in 2025). This is a league-wide environment
-- constant, so using a season's own average is not team or game information.

select
    k.season,
    count(*)                                            as kickoffs,
    avg(n.next_snap_yardline_100)                       as avg_receiving_yardline_100

from {{ ref('fct_plays') }} k
inner join {{ ref('int_next_snap') }} n using (play_uid)
where k.play_type = 'kickoff'
  and k.play_description not ilike '%onside%'
  and n.next_snap_posteam = k.posteam          -- on kickoffs posteam is the receiving team
  and n.is_next_snap_same_half
group by k.season
