// Conta Studio extension to the MIT-licensed rhino3dm bindings.
// Trimmed bicubic height surfaces, with exact degree-six span edge curves.
#include <vector>
#include <algorithm>
#include <cmath>

static ON_NurbsCurve* ContaEdge(const ON_Surface& s, ON_2dPoint a, ON_2dPoint b)
{
  double matrix[7][10] = {};
  const double choose[7]={1,6,15,20,15,6,1};
  for(int r=0;r<7;r++) {
    const double t=r/6.0;
    for(int c=0;c<7;c++) matrix[r][c]=choose[c]*pow(t,c)*pow(1-t,6-c);
    const ON_3dPoint p=s.PointAt(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);
    matrix[r][7]=p.x;matrix[r][8]=p.y;matrix[r][9]=p.z;
  }
  for(int c=0;c<7;c++) {
    int pivot=c;for(int r=c+1;r<7;r++)if(fabs(matrix[r][c])>fabs(matrix[pivot][c]))pivot=r;
    for(int j=0;j<10;j++)std::swap(matrix[c][j],matrix[pivot][j]);
    const double divisor=matrix[c][c];if(fabs(divisor)<1e-14)return nullptr;
    for(int j=c;j<10;j++)matrix[c][j]/=divisor;
    for(int r=0;r<7;r++)if(r!=c){const double f=matrix[r][c];for(int j=c;j<10;j++)matrix[r][j]-=f*matrix[c][j];}
  }
  auto curve=new ON_NurbsCurve(3,false,7,7);
  for(int k=0;k<12;k++)curve->SetKnot(k,k<6?0.0:1.0);
  for(int k=0;k<7;k++)curve->SetCV(k,ON_3dPoint(matrix[k][7],matrix[k][8],matrix[k][9]));
  return curve;
}

static BND_Brep* ContaTerrain(emscripten::val data)
{
  const int count=data["count"].as<int>();
  if(count<4||count>65)return nullptr;
  const double w=data["w"].as<double>(),h=data["h"].as<double>(),factor=data["factor"].as<double>();
  if(!(w>0&&h>0&&factor>0))return nullptr;
  const bool solid=!data["solidThickness"].isUndefined()&&!data["solidThickness"].isNull();
  const double depth=solid?data["solidThickness"].as<double>()*factor:0.0;
  if(solid&&(!(depth>0)||!std::isfinite(depth)))return nullptr;
  const int spans=count-3;
  auto s=new ON_NurbsSurface(3,false,4,4,count,count);
  s->MakeClampedUniformKnotVector(0,1.0);s->MakeClampedUniformKnotVector(1,1.0);
  auto cvs=data["points"];
  for(int j=0;j<count;j++)for(int i=0;i<count;i++){
    auto p=cvs[j*count+i];
    s->SetCV(i,j,ON_3dPoint(p[0].as<double>()*factor,p[1].as<double>()*factor,p[2].as<double>()*factor));
  }
  if(!s->IsValid()){delete s;return nullptr;}
  auto brep=new ON_Brep();const int si=brep->AddSurface(s);
  ON_NurbsSurface* bottom=nullptr;int bsi=-1;
  if(solid){bottom=new ON_NurbsSurface(*s);bottom->Translate(ON_3dVector(0,0,-depth));bottom->Reverse(0);bottom->SetDomain(0,0.0,static_cast<double>(spans));bsi=brep->AddSurface(bottom);}
  auto addTrim=[&](int edge,bool reverse,int loop,ON_2dPoint a,ON_2dPoint b,const ON_Surface& surface){
    auto c2=new ON_LineCurve(a,b);const int ci=brep->AddTrimCurve(c2);
    auto& trim=brep->NewTrim(brep->m_E[edge],reverse,brep->m_L[loop],ci);
    trim.m_type=solid?ON_BrepTrim::mated:ON_BrepTrim::boundary;trim.m_iso=surface.IsIsoparametric(*c2);
    trim.m_tolerance[0]=trim.m_tolerance[1]=1e-9;
  };
  auto polygons=data["polygons"];
  const int np=polygons["length"].as<int>();
  for(int pi=0;pi<np;pi++){
    const int fi=brep->NewFace(si).m_face_index;
    const int bfi=solid?brep->NewFace(bsi).m_face_index:-1;
    auto poly=polygons[pi];const int nr=poly["length"].as<int>();
    for(int ri=0;ri<nr;ri++){
      auto ring=poly[ri];const int length=ring["length"].as<int>();
      std::vector<ON_2dPoint> uv;
      for(int k=0;k+1<length;k++){
        auto pa=ring[k],pb=ring[k+1];
        ON_2dPoint a((pa[0].as<double>()+w/2)/w*spans,(pa[1].as<double>()+h/2)/h*spans);
        ON_2dPoint b((pb[0].as<double>()+w/2)/w*spans,(pb[1].as<double>()+h/2)/h*spans);
        if(a.DistanceTo(b)<1e-11)continue;
        std::vector<double> cuts{0.0,1.0};
        for(int knot=1;knot<spans;knot++){
          if(fabs(b.x-a.x)>1e-12){double t=(knot-a.x)/(b.x-a.x);if(t>1e-10&&t<1-1e-10)cuts.push_back(t);}
          if(fabs(b.y-a.y)>1e-12){double t=(knot-a.y)/(b.y-a.y);if(t>1e-10&&t<1-1e-10)cuts.push_back(t);}
        }
        std::sort(cuts.begin(),cuts.end());
        for(size_t c=0;c+1<cuts.size();c++)if(c==0||cuts[c]-cuts[c-1]>1e-10)
          uv.emplace_back(a.x+(b.x-a.x)*cuts[c],a.y+(b.y-a.y)*cuts[c]);
      }
      if(uv.size()<3){delete brep;return nullptr;}
      double area=0;for(size_t k=0;k<uv.size();k++){auto a=uv[k],b=uv[(k+1)%uv.size()];area+=a.x*b.y-b.x*a.y;}
      if((ri==0&&area<0)||(ri>0&&area>0))std::reverse(uv.begin(),uv.end());
      const int li=brep->NewLoop(ri==0?ON_BrepLoop::outer:ON_BrepLoop::inner,brep->m_F[fi]).m_loop_index;
      std::vector<int> vertices,bottomVertices,verticalEdges,topEdges,bottomEdges;
      for(auto p:uv){
        const ON_3dPoint top=s->PointAt(p.x,p.y);vertices.push_back(brep->NewVertex(top,1e-7*factor).m_vertex_index);
        if(solid){const ON_3dPoint low(top.x,top.y,top.z-depth);bottomVertices.push_back(brep->NewVertex(low,1e-7*factor).m_vertex_index);}
      }
      if(solid)for(size_t k=0;k<uv.size();k++){
        auto curve=new ON_LineCurve(brep->m_V[bottomVertices[k]].Point(),brep->m_V[vertices[k]].Point());const int ci=brep->AddEdgeCurve(curve);
        verticalEdges.push_back(brep->NewEdge(brep->m_V[bottomVertices[k]],brep->m_V[vertices[k]],ci,nullptr,1e-7*factor).m_edge_index);
      }
      for(size_t k=0;k<uv.size();k++){
        const size_t next=(k+1)%uv.size();auto a=uv[k],b=uv[next];
        auto c3=ContaEdge(*s,a,b);if(!c3){delete brep;return nullptr;}
        const int c3i=brep->AddEdgeCurve(c3);
        const int ei=brep->NewEdge(brep->m_V[vertices[k]],brep->m_V[vertices[next]],c3i,nullptr,1e-7*factor).m_edge_index;
        topEdges.push_back(ei);addTrim(ei,false,li,a,b,*s);
        if(solid){
          auto lowCurve=new ON_NurbsCurve(*c3);lowCurve->Translate(ON_3dVector(0,0,-depth));const int ci=brep->AddEdgeCurve(lowCurve);
          bottomEdges.push_back(brep->NewEdge(brep->m_V[bottomVertices[k]],brep->m_V[bottomVertices[next]],ci,nullptr,1e-7*factor).m_edge_index);
        }
      }
      if(solid){
        const int bli=brep->NewLoop(ri==0?ON_BrepLoop::outer:ON_BrepLoop::inner,brep->m_F[bfi]).m_loop_index;
        for(int k=static_cast<int>(uv.size())-1;k>=0;k--){const int next=(k+1)%uv.size();addTrim(bottomEdges[k],true,bli,ON_2dPoint(spans-uv[next].x,uv[next].y),ON_2dPoint(spans-uv[k].x,uv[k].y),*bottom);}
        for(size_t k=0;k<uv.size();k++){
          const size_t next=(k+1)%uv.size();const auto* curve=ON_NurbsCurve::Cast(brep->m_C3[brep->m_E[topEdges[k]].m_c3i]);
          if(!curve){delete brep;return nullptr;}
          auto side=new ON_NurbsSurface(3,false,7,2,7,2);
          for(int j=0;j<12;j++)side->SetKnot(0,j,j<6?0.0:1.0);side->SetKnot(1,0,0.0);side->SetKnot(1,1,1.0);
          for(int j=0;j<7;j++){ON_3dPoint p;curve->GetCV(j,p);side->SetCV(j,0,ON_3dPoint(p.x,p.y,p.z-depth));side->SetCV(j,1,p);}
          const int sideSi=brep->AddSurface(side),sideFi=brep->NewFace(sideSi).m_face_index,sideLi=brep->NewLoop(ON_BrepLoop::outer,brep->m_F[sideFi]).m_loop_index;
          addTrim(bottomEdges[k],false,sideLi,ON_2dPoint(0,0),ON_2dPoint(1,0),*side);
          addTrim(verticalEdges[next],false,sideLi,ON_2dPoint(1,0),ON_2dPoint(1,1),*side);
          addTrim(topEdges[k],true,sideLi,ON_2dPoint(1,1),ON_2dPoint(0,1),*side);
          addTrim(verticalEdges[k],true,sideLi,ON_2dPoint(0,1),ON_2dPoint(0,0),*side);
        }
      }
    }
  }
  brep->SetTrimIsoFlags();brep->Compact();
  ON_wString diagnostic;ON_TextLog log(diagnostic);if(!brep->IsValid(&log)){fprintf(stderr,"Conta terrain: %ls\\n",static_cast<const wchar_t*>(diagnostic));delete brep;return nullptr;}
  if(solid&&!brep->IsSolid()){fprintf(stderr,"Conta terrain solid is not closed.\n");delete brep;return nullptr;}
  return new BND_Brep(brep,nullptr);
}

