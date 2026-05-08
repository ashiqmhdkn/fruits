const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

export async function postmrtitems(request, env) {
  try {
    const formdata = await request.formData();

    const id = crypto.randomUUID();
    const name = formdata.get("name");
    const price = Number(formdata.get("price"));
    const quantity = Number(formdata.get("quantity") ?? 0);
    const image = formdata.get("image");

    if (!name || isNaN(price)) {
      return new Response(JSON.stringify({
        success: false,
        message: "Invalid input"
      }), { status: 400 });
    }

    let imageUrl = null;

    if (image && typeof image !== "string") {
      const imageKey = `mrtimages/${id}`;
      console.log("Uploading image to R2 with key:", env.friuts);
      await env.friuts.put(imageKey, image);
      imageUrl = `https://pub-c6af304c8e664fe5bcd74ee4f5adfb78.r2.dev/${imageKey}`;
    }
    const result = await env.DB.prepare(
      `INSERT INTO mrtitems (id, name, price, quantity, image)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(id, name, price, quantity, imageUrl ?? "").run();

    return Response.json({ success: result.success });

  } catch (err) {
    return Response.json({
      success: false,
      error: err.message
    }, { status: 500 });
  }
}

export async function putmrtitem(request, env) {
  try {
    const id = new URL(request.url).pathname.split("/")[2];

    const object = await env.DB.prepare(
      `SELECT * FROM mrtitems WHERE id = ?`
    ).bind(id).first();

    if (!object) {
      return new Response("Not found", { status: 404 });
    }

    const formdata = await request.formData();

    const name = formdata.get("name") as string | null;
    const priceValue = formdata.get("price");
    const quantityValue = formdata.get("quantity");
    const image = formdata.get("image") as File | null;

    let imageUrl = object.image;

    // Partial updates
    const updatedName = name ?? object.name;

    const updatedPrice =
      priceValue !== null ? Number(priceValue) : object.price;

    const updatedQuantity =
      quantityValue !== null ? Number(quantityValue) : object.quantity;

    // Image update only if new image uploaded
    if (image && image.size > 0) {

      // delete old image
      if (object.image) {
        const oldKey = object.image.split(".r2.dev/")[1];

        if (oldKey) {
          await env.friuts.delete(oldKey);
        }
      }

      const imageKey = `mrtimages/${id}-${image.name}`;

      await env.friuts.put(imageKey, image);

      imageUrl =
        `https://pub-c6af304c8e664fe5bcd74ee4f5adfb78.r2.dev/${imageKey}`;
    }

    const result = await env.DB.prepare(
      `UPDATE mrtitems
       SET name = ?, price = ?, quantity = ?, image = ?
       WHERE id = ?`
    )
      .bind(
        updatedName,
        updatedPrice,
        updatedQuantity,
        imageUrl,
        id
      )
      .run();

    return new Response(
      JSON.stringify({
        success: result.success,
      }),
      { headers }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message,
      }),
      { status: 500, headers }
    );
  }
}

export async function deletemrtitem(request, env) {
  try {

    const id = new URL(request.url).pathname.split("/")[2];

    const item = await env.DB.prepare(
      `SELECT image FROM mrtitems WHERE id = ?`
    ).bind(id).first();

    if (!item) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Item not found."
        }),
        { status: 404, headers }
      );
    }

    // Delete image from R2
    if (item.image) {

      try {

        const url = new URL(item.image);

        // remove leading "/"
        const key = url.pathname.substring(1);

        console.log("Deleting key:", key);

        await env.friuts.delete(key);

      } catch (e) {

        console.log("Image delete failed:", e);
      }
    }

    // Delete DB row
    const result = await env.DB.prepare(
      `DELETE FROM mrtitems WHERE id = ?`
    ).bind(id).run();

    return new Response(
      JSON.stringify({
        success: result.success
      }),
      { headers }
    );

  } catch (err: any) {

    return new Response(
      JSON.stringify({
        success: false,
        error: err.message
      }),
      { status: 500, headers }
    );
  }
}

export async function getmrtitems(request, env) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT * FROM mrtitems ORDER BY id DESC`
    ).all();

    return new Response(JSON.stringify({
      success: true,
      items: results
    }), { headers });

  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: err.message
    }), { status: 500, headers });
  }
}