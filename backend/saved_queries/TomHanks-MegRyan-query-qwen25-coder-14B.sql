WITH
  tom_hanks_movies AS (
    SELECT
      m.id AS movie_id,
      m.name AS movie_name,
      m.date AS release_date
    FROM
      movies m
      JOIN casts c ON m.id = c.movie_id
      JOIN people p ON c.person_id = p.id
    WHERE
      p.name = 'Tom Hanks' -- Filter for Tom Hanks
  ),
  -- Step 2: Find all movies where Meg Ryan has acted
  meg_ryan_movies AS (
    SELECT
      m.id AS movie_id,
      m.name AS movie_name,
      m.date AS release_date
    FROM
      movies m
      JOIN casts c ON m.id = c.movie_id
      JOIN people p ON c.person_id = p.id
    WHERE
      p.name = 'Meg Ryan' -- Filter for Meg Ryan
  ),
  -- Step 3: Find common movies where both Tom Hanks and Meg Ryan have acted
  common_movies AS (
    SELECT
      thm.movie_id,
      thm.movie_name,
      thm.release_date
    FROM
      tom_hanks_movies thm
      JOIN meg_ryan_movies mrm ON thm.movie_id = mrm.movie_id -- Join to find common movies
  )
  -- Step 4: Select the movie details and sort by release year in descending order
SELECT
  cm.movie_name,
  cm.release_date
FROM
  common_movies cm
ORDER BY
  cm.release_date DESC NULLS LAST;

-- Sort by release date with latest first