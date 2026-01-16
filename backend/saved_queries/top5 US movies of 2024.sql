WITH
  top_us_movies AS (
    SELECT
      id,
      name,
      revenue
    FROM
      movies
    WHERE
      date BETWEEN '2024-01-01' AND '2024-12-31'
      AND id IN (
        SELECT
          movie_id
        FROM
          movie_countries
        WHERE
          country = 'US'
      )
    ORDER BY
      revenue DESC NULLS LAST
    LIMIT
      5
  )
SELECT
  t.name,
  t.revenue
FROM
  top_us_movies t;