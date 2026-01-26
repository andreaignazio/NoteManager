def flatten_tree(items, parent_temp=None, out=None):
    if out is None:
        out = []

    for it in items:
        children = it.get("children") or []

        node = dict(it)
        node.pop("children", None)
        node["_parent_temp"] = parent_temp
        out.append(node)

        flatten_tree(children, it.get("tempId"), out)

    return out