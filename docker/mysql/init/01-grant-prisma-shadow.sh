#!/bin/sh
set -eu

mysql -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
GRANT CREATE, DROP, ALTER ON *.* TO '${MYSQL_USER}'@'%';
GRANT ALL PRIVILEGES ON \
  \`prisma\\_migrate\\_shadow\\_db\\_%\`.* TO '${MYSQL_USER}'@'%';
FLUSH PRIVILEGES;
SQL
