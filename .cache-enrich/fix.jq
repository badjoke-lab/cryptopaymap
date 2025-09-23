def trimstr: gsub("^\\s+|\\s+$";"");

map(
  if type=="object" then
    (
      # website 正規化
      .website |= (
        if type=="string" and (.|length)>0
        then ( if test("^https?://") then . else "https://" + . end )
        else .
        end
      )
      # tags を正規化
      | .tags |= (
          if type=="array" then .
          elif type=="string" then [ . ]
          elif . == null then []
          else .
          end
        )
      # tags から主要フィールドを展開
      | (
          .hours     //= ( .tags | map(select(test("^opening_hours=")))       | map(sub("^opening_hours=";""))       | join("; ") )
        | .phone     //= ( .tags | map(select(test("^(contact:)?phone=")))   | map(sub("^(contact:)?phone=";""))   | join("; ") )
        | .instagram //= ( .tags | map(select(test("^contact:instagram="))) | map(sub("^contact:instagram=";"")) | join("; ") )
        | .twitter   //= ( .tags | map(select(test("^contact:twitter=")))   | map(sub("^contact:twitter=";""))   | join("; ") )
        | .cuisine   //= ( .tags | map(select(test("^cuisine=")))           | map(sub("^cuisine=";""))           | join(", ") )
        | .payment   //= {
            lightning:      ( [ .tags[] | select(test("^payment:lightning")) ] | length > 0 ),
            onchain:        ( [ .tags[] | select(test("^payment:onchain")) ]   | length > 0 ),
            cash:           ( [ .tags[] | select(test("^payment:cash")) ]      | length > 0 ),
            credit_cards:   ( [ .tags[] | select(test("^payment:credit_cards")) ] | length > 0 )
          }
      )
      # 空文字キーを削除
      | reduce (keys_unsorted[]) as $k (.;
          if (.[ $k ] | type) == "string"
             and ((.[ $k ] | trimstr) | length) == 0
          then del(.[ $k ])
          else .
          end
        )
    )
  else .
  end
)
