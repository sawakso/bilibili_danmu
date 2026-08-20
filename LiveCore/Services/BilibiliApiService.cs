using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using LiveCore.Consts;
using LiveCore.Enums;
using LiveCore.Models;
using Newtonsoft.Json.Linq;
// ReSharper disable AssignNullToNotNullAttribute
// ReSharper disable PossibleNullReferenceException

namespace LiveCore.Services;

public class BilibiliApiService
{

    private readonly HttpClient _httpClient;

    public BilibiliApiService(IHttpClientFactory httpClientFactory)
    {
        _httpClient = httpClientFactory.CreateClient();
        _httpClient.Timeout = TimeSpan.FromSeconds(30);
    }

    public async Task<BroadCastInfo> GetBroadCastInfoAsync(int roomId)
    {
        var requestContent = await _httpClient.GetStringAsync(BilibiliApiUrlConsts.BroadCastUrl + roomId);
        var data = JObject.Parse(requestContent)["data"]!;

        var token = data["token"]!.Value<string>();
        var servers = new List<BroadCastServer>();

        // 新接口返回的是服务器数组 (host_server_list / host_list / server_list)
        var serverList = data["host_server_list"] ?? data["host_list"] ?? data["server_list"];
        if (serverList != null && serverList.Type == JTokenType.Array)
        {
            foreach (var item in serverList)
            {
                var host = item["host"]?.Value<string>();
                if (string.IsNullOrWhiteSpace(host))
                {
                    continue;
                }
                var port = item["port"]?.Value<int>()
                           ?? item["wss_port"]?.Value<int>()
                           ?? 2243;
                servers.Add(new BroadCastServer { Host = host, Port = port });
            }
        }

        // 兼容老字段 (单一 host/port，已被 B 站废弃的 HTTP 网关，可能返回 403)
        if (servers.Count == 0 && data["host"] != null)
        {
            servers.Add(new BroadCastServer
            {
                Host = data["host"]!.Value<string>(),
                Port = data["port"]!.Value<int>()
            });
        }

        return new BroadCastInfo
        {
            Token = token,
            Servers = servers
        };
    }

    /// <summary>
    /// 通过 HTTP 拉取弹幕历史（用于长连接不可用时的轮询回退）。
    /// gethistory 返回最近若干条弹幕（最新在前），无需 TCP/WebSocket 长连接。
    /// </summary>
    public async Task<List<BarrageInfo>> GetDanmuHistoryAsync(int roomId)
    {
        var list = new List<BarrageInfo>();
        try
        {
            var request = new HttpRequestMessage(HttpMethod.Get,
                $"https://api.live.bilibili.com/xlive/web-room/v1/dM/gethistory?roomid={roomId}");
            request.Headers.Add("Referer", $"https://live.bilibili.com/{roomId}");
            request.Headers.Add("User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

            var response = await _httpClient.SendAsync(request);
            var content = await response.Content.ReadAsStringAsync();
            var jObj = JObject.Parse(content);
            if (jObj["code"]?.Value<int>() != 0)
            {
                return list;
            }

            var room = jObj["data"]?["room"];
            if (room == null || room.Type != JTokenType.Array)
            {
                return list;
            }

            foreach (var item in room)
            {
                try
                {
                    var text = item["text"]?.Value<string>() ?? string.Empty;
                    if (string.IsNullOrWhiteSpace(text))
                    {
                        continue;
                    }

                    var uid = item["uid"]?.Value<long>() ?? 0;
                    var nickname = item["nickname"]?.Value<string>() ?? string.Empty;
                    var timelineStr = item["timeline"]?.Value<string>();
                    var isAdmin = item["isadmin"]?.Value<int>() == 1;
                    var guardLevel = item["guard_level"]?.Value<int>() ?? 0;

                    var medalArr = item["medal"];
                    var hasMedal = medalArr != null && medalArr.Any();
                    string medalName = string.Empty;
                    int medalLevel = 0;
                    if (hasMedal)
                    {
                        medalName = medalArr[0]?["medal_name"]?.Value<string>() ?? string.Empty;
                        medalLevel = medalArr[0]?["medal_level"]?.Value<int>() ?? 0;
                    }

                    var face = item["user"]?["base"]?["face"]?.Value<string>() ?? string.Empty;

                    DateTime time;
                    if (!DateTime.TryParseExact(timelineStr, "yyyy-MM-dd HH:mm:ss",
                            CultureInfo.InvariantCulture, DateTimeStyles.None, out time))
                    {
                        time = DateTime.Now;
                    }

                    list.Add(new BarrageInfo
                    {
                        Mid = uid.ToString(),
                        FaceUrl = face,
                        Comment = text,
                        IsAdmin = isAdmin,
                        Time = time,
                        UserName = nickname,
                        HasMedal = hasMedal,
                        MedalName = medalName,
                        MedalLevel = medalLevel,
                        Top3 = 0,
                        Guard = GuardType.CheckGuardByLevel(guardLevel) ?? GuardType.白嫖的观众,
                    });
                }
                catch
                {
                    // 单条解析失败跳过
                }
            }
        }
        catch
        {
            // API 调用失败返回空列表
        }

        return list;
    }

    public async Task<string> GetUserAvatarFromSpaceHtmlAsync(string mid)
    {
        try
        {
            string response = await _httpClient.GetStringAsync($"https://space.bilibili.com/{mid}");
            int i = response.IndexOf("href=\"//i0.hdslb.com", StringComparison.Ordinal);
            if (i == -1)
            {
                i = response.IndexOf("href=\"//i1.hdslb.com", StringComparison.Ordinal);
                if (i == -1)
                {
                    i = response.IndexOf("href=\"//i2.hdslb.com", StringComparison.Ordinal);
                }
            }

            if (i == -1)
            {
                //请求个人信息api
            }
            else
            {
                response = response[i..];
                i = response.IndexOf(".jpg\">", StringComparison.Ordinal);
                if (i != -1)
                {
                    return string.Concat("http:", response.AsSpan(6, i - 2));
                }
            }

            return string.Empty;
        }
        catch
        {
            return string.Empty;
        }
    }


    public async Task<RoomInfo> GetRoomInfoAsync(int roomId)
    {
        var response = await _httpClient.GetStringAsync(BilibiliApiUrlConsts.RoomInfoUrl + roomId);
        var jObj = JObject.Parse(response);
        var code = jObj["code"].Value<int>();
        if (code != 0)
        {
            return null;
        }
        var data = jObj["data"];

        return new RoomInfo
        {
            Uid = data["uid"].Value<long>(),
            RoomId = data["room_id"].Value<int>(),
            ShortRoomId = data["short_id"].Value<int>(),
            Title = data["title"].Value<string>(),
            Tags = data["tags"].Value<string>().Split(','),
            Description = data["description"].Value<string>(),
            ParentAreaId = data["parent_area_id"].Value<int>(),
            ParentAreaName = data["parent_area_name"].Value<string>(),
            AreaId = data["area_id"].Value<int>(),
            AreaName = data["area_name"].Value<string>(),
            LiveStatus = (LiveStatusType)data["live_status"].Value<int>(),
            LiveTime = data["live_status"].Value<int>() != 1 ? null : data["live_time"].Value<DateTime>(),
            BackgroundUrl = data["background"].Value<string>(),
            KeyFrameUrl = data["keyframe"].Value<string>(),
            UserCoverUrl = data["user_cover"].Value<string>(),
        };
    }


    /// <summary>
    /// api获取礼物信息(不完整),需要使用GiftUtils
    /// </summary>
    /// <param name="roomId"></param>
    /// <returns></returns>
    public async Task<List<GiftInfo>> GetGiftListAsync(int roomId)
    {
        var roomInfo = await GetRoomInfoAsync(roomId);

        //platform=pc&room_id=6750632&area_parent_id=2&area_id=92&source=live&build=0&global_version=
        var timestamp = DateTimeOffset.Now.ToUnixTimeMilliseconds();

        using var content = new FormUrlEncodedContent(new Dictionary<string, string>()
        {
            ["platform"] = "pc",
            ["room_id"] = roomInfo.RoomId.ToString(),
            ["area_parent_id"] = roomInfo.ParentAreaId.ToString(),
            ["area_id"] = roomInfo.AreaId.ToString(),
            ["source"] = "live",
            ["build"] = "0",
            ["global_version"] = timestamp.ToString()
        });

        var p = await content.ReadAsStringAsync();
        string url = string.Concat(BilibiliApiUrlConsts.GiftListUrl, "?", p);

        var response = await _httpClient.GetStringAsync(url);
        var jObj = JObject.Parse(response);

        var data = jObj["data"];
        var list = data["list"];


        var giftList = new List<GiftInfo>(list.Count());

        list.ToList().ForEach(j =>
        {
            giftList.Add(new GiftInfo()
            {
                Id = j["id"].Value<int>(),
                Name = j["name"].Value<string>(),
                Price = j["price"].Value<int>(),
                Description = j["desc"].Value<string>(),
                Gif = j["gif"].Value<string>(),
            });
        });



        response = await _httpClient.GetStringAsync("https://api.live.bilibili.com/xlive/web-room/v1/giftPanel/roomGiftConfig?platform=pc&global_version=" + timestamp);

        jObj = JObject.Parse(response);

        data = jObj["data"];
        list = data["list"];

        list.ToList().ForEach(j =>
        {
            if (giftList.All(x => x.Id != j["id"].Value<int>()))
            {
                giftList.Add(new GiftInfo()
                {
                    Id = j["id"].Value<int>(),
                    Name = j["name"].Value<string>(),
                    Price = j["price"].Value<int>(),
                    Description = j["desc"].Value<string>(),
                    Gif = j["gif"].Value<string>(),
                });
            }
        });

        return giftList.OrderBy(j => j.Id).ToList();

    }




    public async Task<string> GetBroadCastStreamUrlAsync(int roomId)
    {
        var roomInfo = await GetRoomInfoAsync(roomId);

        using var content = new FormUrlEncodedContent(new Dictionary<string, string>()
        {
            ["cid"] = roomInfo.RoomId.ToString(),
            ["platform"] = "web", //h5:hls方式  , web:http-flv方式
            ["quality"] = "4", //2.流畅 3.高清 4.原画
            //["qn"] = 80：流畅 150：高清 400：蓝光 10000：原画 20000：4K 30000：杜比
        });

        var client = new HttpClient();
        client.DefaultRequestHeaders.Add("Referer", "https://www.bilibili.com");
        client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.87 Safari/537.36");
        client.DefaultRequestHeaders.Add("Origin", "https://www.bilibili.com");
        var response = await client.GetStringAsync(BilibiliApiUrlConsts.BroadCastStreamUrl + "?" + await content.ReadAsStringAsync());
        var jObj = JObject.Parse(response);
        var urlInfos = jObj["data"]["durl"];
        var url = urlInfos[0]["url"].Value<string>();

        //response = await _client.GetStringAsync("https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id=6750632&protocol=0,1&format=0,1,2&codec=0,1&qn=10000");
        //jObj = JObject.Parse(response);

        return url;
    }

    public async Task<StreamerInfo> GetStreamerInfoAsync(long mid)
    {
        using var content = new FormUrlEncodedContent(new Dictionary<string, string>()
        {
            ["uid"] = mid.ToString(),
        });

        var response = await _httpClient.GetStringAsync(BilibiliApiUrlConsts.StreamerInfoUrl + "?" + await content.ReadAsStringAsync());
        var jObj = JObject.Parse(response);
        var data = jObj["data"];

        var info = data["info"];

        var userName = info["uname"].Value<string>();
        var face = info["face"].Value<string>();
        //-1：保密,0：女 ,1：男
        var gender = info["gender"].Value<int>();

        var level = data["exp"]["master_level"]["level"].Value<int>();
        var followerNum = data["follower_num"].Value<int>();

        var pendant = data["pendant"].Value<string>();

        var board = data["room_news"]["content"].Value<string>();

        return new StreamerInfo()
        {
            Uid = mid,
            UserName = userName,
            Face = face,
            Gender = gender,
            Level = level,
            FollowerNum = followerNum,
            Pendant = pendant,
            BoardMessage = board
        };
    }
}