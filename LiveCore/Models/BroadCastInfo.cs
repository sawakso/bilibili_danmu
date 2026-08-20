using System.Collections.Generic;

namespace LiveCore.Models
{
    public class BroadCastInfo
    {
        public string Token { get; set; }
        /// <summary>
        /// 弹幕服务器列表(从 getConf 的 host_server_list / host_list / server_list 解析)
        /// </summary>
        public List<BroadCastServer> Servers { get; set; } = new();
    }

    public class BroadCastServer
    {
        public string Host { get; set; }
        public int Port { get; set; }
    }
}
