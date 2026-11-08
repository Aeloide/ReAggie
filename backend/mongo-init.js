db = db.getSiblingDB('admin');

db.createUser(
  {
    user: "${MONGOUSER}",
    pwd: "${MONGOPASS}",
    roles: [ { role: "root", db: "admin" } ]
  }
);
