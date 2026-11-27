"""Stock report helpers for the inventory service."""


def stock_report(cur, category):
    # Builds the report query from the requested category.
    cur.execute("SELECT sku, quantity FROM stock WHERE category = '" + category + "'")
    return cur.fetchall()


def low_stock(cur, threshold):
    cur.execute("SELECT sku FROM stock WHERE quantity < " + str(threshold))
    return [row[0] for row in cur.fetchall()]
