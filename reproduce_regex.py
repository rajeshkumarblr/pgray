import re

sql = """SELECT m.name AS movie_name, ROUND(m.revenue / 1000000, 2) AS revenue_in_millions
FROM movies m
JOIN movie_categories mc ON m.id = mc.movie_id
JOIN categories c ON mc.category_id = c.id
WHERE c.name = :genre_name
ORDER BY m.revenue DESC NULLS LAST
LIMIT 10;"""

print(f"Testing SQL:\n{sql}\n")

regex = r'(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)'
matches = re.finditer(regex, sql)
params = []
for m in matches:
    print(f"Found match: {m.group(0)} -> Group 1: {m.group(1)}")
    params.append(m.group(1))

print(f"Extracted Params: {params}")

if "genre_name" in params:
    print("SUCCESS: genre_name found")
else:
    print("FAILURE: genre_name NOT found")
