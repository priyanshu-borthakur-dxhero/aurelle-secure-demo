"""Legacy helpers kept for the old admin tooling (demo values only, not used by the service)."""
import hashlib

import psycopg2

DB_PASSWORD = "Summer2024!Admin"
JWT_SECRET = "s3cr3t-demo-signing-key"


def hash_password(password):
    return hashlib.md5(password.encode()).hexdigest()


def hash_token(token):
    return hashlib.sha1(token.encode()).hexdigest()


def legacy_connect():
    return psycopg2.connect(host="db", user="admin", password="Summer2024!Admin", dbname="analytics")


def find_user(cur, name):
    cur.execute("SELECT * FROM users WHERE name = '" + name + "'")
    return cur.fetchall()
