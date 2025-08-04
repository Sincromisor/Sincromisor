from consul import Consul

client = Consul(host="127.0.0.1", port=8500)


# カタログに登録されている全てのノードの一覧
def all_node_names(client: Consul) -> list[str]:
    nodes: list[str] = []
    for node in client.catalog.nodes()[1]:
        nodes.append(node["Node"])
    return nodes


# 現在稼働しており、クラスタに参加しているノードの一覧
def active_node_names(client: Consul) -> list[str]:
    nodes: list[str] = []
    for node in client.agent.members():
        # 1: active
        if node["Status"] == 1:
            nodes.append(node["Name"])
    return nodes


# カタログに登録されているが、クラスタに参加していないノードを
# カタログから削除
def deregister_inactive_nodes(client: Consul) -> list[str]:
    nodes: list[str] = []
    node_name: str
    active_nodes: list[str] = active_node_names(client=client)
    for node_name in all_node_names(client=client):
        if node_name not in active_nodes:
            client.catalog.deregister(node=node_name)
            nodes.append(node_name)
    return nodes


print("All Nodes:")
results: list[str] = all_node_names(client=client)
print(results)

print("\nActive Nodes:")
results: list[str] = active_node_names(client=client)
print(results)

print("\nDeregister Nodes:")
results: list[str] = deregister_inactive_nodes(client=client)
print(results)
