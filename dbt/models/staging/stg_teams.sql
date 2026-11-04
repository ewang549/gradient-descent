-- stg_teams: one row per team abbreviation (current and historical), with branding for visuals.
-- franchise_id links relocations: OAK/LV, SD/LAC, STL/LA/LAR share one id.

select
    team_abbr,
    team_id                 as franchise_id,
    team_name,
    team_nick,
    team_conf               as conference,
    team_division           as division,
    team_color              as color_primary,
    team_color2             as color_secondary,
    team_color3             as color_tertiary,
    team_color4             as color_quaternary,
    team_logo_espn          as logo_url,
    team_logo_squared       as logo_squared_url,
    team_wordmark           as wordmark_url

from {{ source('raw', 'teams') }}
